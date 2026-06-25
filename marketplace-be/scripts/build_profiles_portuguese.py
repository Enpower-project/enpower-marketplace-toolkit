"""
build_profiles_portuguese.py — Genera perfiles de referencia STD/MIN/MAX
para el Pilot Portugués (intervalos de 15 minutos, 3 columnas).

Diferencias respecto a build_profiles.py (Irish Pilot):
  - Columnas: timestamp, consumption [W], injection [W]
  - Sin storage_dispatch ni net_load_with_flex / net_load_without_flex
  - injection [W] = energía inyectada a la red (solar/FV)
  - Los tres perfiles se calculan desde consumption [W]:
      STD = media por slot temporal
      MIN = mínimo por slot temporal  (máxima flex. downward potencial)
      MAX = máximo por slot temporal  (máxima flex. upward potencial)
  - Timestamps con timezone offset (+01:00) — se eliminan antes del procesado

Uso:
    python build_profiles_portuguese.py <input_file.csv>

Ejemplo:
    python build_profiles_portuguese.py test-data/PT/P3.csv

Salida (misma carpeta que el input):
    P3_STD.csv  (96 filas, HH:MM por slot de 15 min)
    P3_MIN.csv  (96 filas)
    P3_MAX.csv  (96 filas)
"""
import io
import os
import sys
import pandas as pd

# Forzar UTF-8 en el terminal Windows para evitar errores con caracteres especiales
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')


def to_float_series(s: pd.Series) -> pd.Series:
    """Convierte strings tipo '305,0525' o '305.0525' o números en float."""
    return (
        s.astype(str)
         .str.replace('"', '', regex=False)
         .str.replace(",", ".", regex=False)
         .astype(float)
    )


def read_csv_robust(filepath: str) -> pd.DataFrame:
    """
    Lee un CSV que puede tener cada fila envuelta en comillas dobles
    (ocurre cuando Excel exporta celdas que contienen comas).
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        raw_lines = f.readlines()

    first = raw_lines[0].strip()
    if first.startswith('"') and first.endswith('"'):
        clean = []
        for line in raw_lines:
            s = line.strip()
            if s.startswith('"') and s.endswith('"'):
                s = s[1:-1]
            if s:
                clean.append(s)
        return pd.read_csv(io.StringIO('\n'.join(clean)))

    return pd.read_csv(filepath)


def build_output_df(consumption_by_slot: pd.Series, injection_by_slot: pd.Series) -> pd.DataFrame:
    """
    Construye el DataFrame de salida con 96 filas (slots de 15 min).
    Mantiene ambas columnas del Pilot Portugués.
    """
    out = consumption_by_slot.rename("consumption [W]").reset_index()
    out = out.rename(columns={"slot": "timestamp"})
    out["injection [W]"] = injection_by_slot.values

    return out[["timestamp", "consumption [W]", "injection [W]"]]


def validate_interval(df: pd.DataFrame) -> None:
    """Verifica que el CSV tenga intervalos de 15 minutos."""
    df_sorted = df.sort_values("timestamp").reset_index(drop=True)
    if len(df_sorted) < 2:
        return

    first_day = df_sorted["timestamp"].dt.date.iloc[0]
    day_data = df_sorted[df_sorted["timestamp"].dt.date == first_day]

    if len(day_data) >= 2:
        delta = day_data["timestamp"].iloc[1] - day_data["timestamp"].iloc[0]
        minutes = int(delta.total_seconds() / 60)

        if minutes != 15:
            print(f"⚠️  Intervalo detectado: {minutes} min (se esperaban 15 min)")
            print("    El script funcionará igualmente, pero los perfiles pueden tener más o menos de 96 filas.")
        else:
            print(f"✔ Intervalo verificado: 15 minutos")


def main(input_csv: str):
    if not os.path.exists(input_csv):
        raise FileNotFoundError(f"Archivo no encontrado: {input_csv}")

    print(f"📂 Leyendo: {input_csv}")

    # Cargar CSV (maneja formato estándar y formato Excel con filas entre comillas)
    df = read_csv_robust(input_csv)

    # Verificar columna timestamp
    if "timestamp" not in df.columns:
        raise ValueError(
            f"Columna 'timestamp' no encontrada.\n"
            f"Columnas disponibles: {list(df.columns)}"
        )

    # Verificar columna requerida
    col_consumption = "consumption [W]"
    if col_consumption not in df.columns:
        raise ValueError(
            f"Columna requerida no encontrada: '{col_consumption}'\n"
            f"Columnas disponibles: {list(df.columns)}"
        )

    # Parsear timestamp eliminando timezone offset (+01:00, -03:00, etc.)
    # para evitar problemas de conversión UTC al extraer el slot HH:MM
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_localize(None)

    # Verificar intervalo
    validate_interval(df)

    # Convertir columnas a float (maneja formato europeo con coma decimal)
    df[col_consumption] = to_float_series(df[col_consumption])

    col_injection = "injection [W]"
    has_injection = col_injection in df.columns
    if has_injection:
        df[col_injection] = to_float_series(df[col_injection])
    else:
        print(f"⚠️  Columna '{col_injection}' no encontrada, se usará 0.0")
        df[col_injection] = 0.0

    # Extraer slot temporal HH:MM (agrupa datos del mismo slot entre días)
    df["slot"] = df["timestamp"].dt.strftime("%H:%M")

    # Calcular los tres perfiles por slot temporal desde consumption [W]
    g_consumption = df.groupby("slot")[col_consumption]
    g_injection = df.groupby("slot")[col_injection]

    profiles = {
        "STD": (g_consumption.mean().sort_index(), g_injection.mean().sort_index()),
        "MIN": (g_consumption.min().sort_index(),  g_injection.min().sort_index()),
        "MAX": (g_consumption.max().sort_index(),  g_injection.max().sort_index()),
    }

    # Estadísticas
    n_days = df["timestamp"].dt.date.nunique()
    n_slots = df["slot"].nunique()
    print(f"📊 Días procesados: {n_days}")
    print(f"📊 Slots temporales: {n_slots} (esperados: 96 para 15 min/día)\n")

    # Generar archivos de salida
    base_name = os.path.splitext(os.path.basename(input_csv))[0]
    out_dir = os.path.dirname(input_csv) or "."

    for label, (consumption_series, injection_series) in profiles.items():
        out_df = build_output_df(consumption_series, injection_series)
        out_path = os.path.join(out_dir, f"{base_name}_{label}.csv")
        out_df.to_csv(out_path, index=False)
        print(f"✔ Creado {out_path} ({len(out_df)} filas)")

    print(f"\n✅ Perfiles STD/MIN/MAX generados correctamente")
    print(f"   Nota: Los tres perfiles usan 'consumption [W]' como base de flexibilidad")
    print(f"   injection [W] = energía solar inyectada a la red (mapeada a PV_PRODUCTION)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python build_profiles_portuguese.py <input_file.csv>")
        print("\nEjemplo:")
        print("  python build_profiles_portuguese.py test-data/PT/P3.csv")
        sys.exit(1)

    main(sys.argv[1])
