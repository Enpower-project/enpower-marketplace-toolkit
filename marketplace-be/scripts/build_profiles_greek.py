"""
build_profiles_greek.py — Genera perfiles de referencia STD/MIN/MAX
para el Pilot Griego (intervalos de 30 minutos, 4 columnas).

Diferencias respecto a build_profiles.py (Irish Pilot):
  - Intervalo: 30 min → 48 filas por perfil (en vez de 96 a 15 min)
  - Columnas: timestamp, consumption [W], pv_production [W], net_load_without_flex [W]
  - Sin storage_dispatch ni net_load_with_flex
  - Los tres perfiles se calculan desde net_load_without_flex:
      STD = media por slot temporal
      MIN = mínimo por slot temporal  (máxima flex. downward potencial)
      MAX = máximo por slot temporal  (máxima flex. upward potencial)

Uso:
    python build_profiles_greek.py <input_file.csv>

Ejemplo:
    python build_profiles_greek.py test-data/flexibility/GR/greek_pilot_data.csv

Salida (misma carpeta que el input):
    greek_pilot_data_STD.csv  (48 filas)
    greek_pilot_data_MIN.csv  (48 filas)
    greek_pilot_data_MAX.csv  (48 filas)
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


def build_output_df(series_by_slot: pd.Series) -> pd.DataFrame:
    """
    series_by_slot: Series indexada por slot 'HH:MM' (48 entradas)
    Devuelve DataFrame con 48 filas en formato del Pilot Griego.
    """
    out = series_by_slot.rename("net_load_without_flex [W]").reset_index()
    out = out.rename(columns={"slot": "timestamp"})

    # Para el Pilot Griego usamos net_load_without_flex como base de consumo
    # (no hay storage, así que consumption ≈ net_load_without_flex - pv)
    # Los perfiles de referencia solo necesitan net_load_without_flex para
    # calcular la capacidad de flexibilidad (STANDARD - actual = desviación)
    out["consumption [W]"] = out["net_load_without_flex [W]"]
    out["pv_production [W]"] = 0.0

    return out[[
        "timestamp",
        "consumption [W]",
        "pv_production [W]",
        "net_load_without_flex [W]",
    ]]


def validate_interval(df: pd.DataFrame) -> None:
    """Verifica que el CSV tenga intervalos de 30 minutos."""
    df_sorted = df.sort_values("timestamp").reset_index(drop=True)
    if len(df_sorted) < 2:
        return

    # Toma los primeros dos timestamps del primer día para determinar intervalo
    first_day = df_sorted["timestamp"].dt.date.iloc[0]
    day_data = df_sorted[df_sorted["timestamp"].dt.date == first_day]

    if len(day_data) >= 2:
        delta = day_data["timestamp"].iloc[1] - day_data["timestamp"].iloc[0]
        minutes = int(delta.total_seconds() / 60)

        if minutes != 30:
            print(f"⚠️  Intervalo detectado: {minutes} min (se esperaban 30 min)")
            print("    El script funcionará igualmente, pero los perfiles pueden tener más o menos de 48 filas.")
        else:
            print(f"✔ Intervalo verificado: 30 minutos")


def read_csv_robust(filepath: str) -> pd.DataFrame:
    """
    Lee un CSV que puede tener cada fila envuelta en comillas dobles
    (ocurre cuando Excel exporta celdas que contienen comas).
    Ejemplo: '"timestamp,consumption [W],..."' → columns correctas
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        raw_lines = f.readlines()

    first = raw_lines[0].strip()
    if first.startswith('"') and first.endswith('"'):
        # Quitar comillas externas de cada fila
        clean = []
        for line in raw_lines:
            s = line.strip()
            if s.startswith('"') and s.endswith('"'):
                s = s[1:-1]
            if s:
                clean.append(s)
        return pd.read_csv(io.StringIO('\n'.join(clean)))

    return pd.read_csv(filepath)


def main(input_csv: str):
    if not os.path.exists(input_csv):
        raise FileNotFoundError(f"Archivo no encontrado: {input_csv}")

    print(f"📂 Leyendo: {input_csv}")

    # Cargar CSV (maneja formato estándar y formato Excel con filas entre comillas)
    df = read_csv_robust(input_csv)

    # Verificar columna timestamp
    if "timestamp" not in df.columns:
        raise ValueError("El CSV debe tener una columna 'timestamp'")

    df["timestamp"] = pd.to_datetime(df["timestamp"])

    # Verificar columna requerida
    col_base = "net_load_without_flex [W]"
    if col_base not in df.columns:
        raise ValueError(
            f"Columna requerida no encontrada: '{col_base}'\n"
            f"Columnas disponibles: {list(df.columns)}"
        )

    # Verificar intervalo
    validate_interval(df)

    # Convertir a float (maneja formato europeo con coma decimal)
    df[col_base] = to_float_series(df[col_base])

    # Extraer slot temporal HH:MM (agrupa datos del mismo slot entre días)
    df["slot"] = df["timestamp"].dt.strftime("%H:%M")
    grouped = df.groupby("slot")[col_base]

    # Calcular los tres perfiles por slot temporal
    profiles = {
        "STD": grouped.mean().sort_index(),
        "MIN": grouped.min().sort_index(),
        "MAX": grouped.max().sort_index(),
    }

    # Estadísticas de días procesados
    n_days = df["timestamp"].dt.date.nunique()
    n_slots = df["slot"].nunique()
    print(f"📊 Días procesados: {n_days}")
    print(f"📊 Slots temporales: {n_slots} (esperados: 48 para 30 min/día)\n")

    # Generar archivos de salida
    base_name = os.path.splitext(os.path.basename(input_csv))[0]
    out_dir = os.path.dirname(input_csv) or "."

    for label, series in profiles.items():
        out_df = build_output_df(series)
        out_path = os.path.join(out_dir, f"{base_name}_{label}.csv")
        out_df.to_csv(out_path, index=False)
        print(f"✔ Creado {out_path} ({len(out_df)} filas)")

    print(f"\n✅ Perfiles STD/MIN/MAX generados correctamente")
    print(f"   Nota: Los tres perfiles usan 'net_load_without_flex' como base")
    print(f"   (sin batería/almacenamiento, net_load_with_flex = net_load_without_flex)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python build_profiles_greek.py <input_file.csv>")
        print("\nEjemplo:")
        print("  python build_profiles_greek.py test-data/flexibility/GR/greek_pilot_data.csv")
        sys.exit(1)

    main(sys.argv[1])
