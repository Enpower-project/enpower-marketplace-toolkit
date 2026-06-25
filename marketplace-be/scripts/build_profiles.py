import os
import sys
import pandas as pd

def to_float_series(s: pd.Series) -> pd.Series:
    """
    Converte stringhe tipo "305,0525" o numeri in float.
    """
    return (
        s.astype(str)
         .str.replace('"', '', regex=False)
         .str.replace(",", ".", regex=False)
         .astype(float)
    )

def build_output_df(series_by_slot: pd.Series) -> pd.DataFrame:
    """
    series_by_slot: Series indicizzata per slot 'HH:MM'
    Ritorna DF con 96 righe + header
    """
    out = series_by_slot.rename("consumption [W]").reset_index()
    out = out.rename(columns={"slot": "timestamp"})  # timestamp = HH:MM (slot)

    out["storage_dispatch [W]"] = 0.0
    out["pv_production [W]"] = 0.0
    out["net_load_with_flex [W]"] = out["consumption [W]"]
    out["net_load_without_flex [W]"] = out["consumption [W]"]

    return out[[
        "timestamp",
        "consumption [W]",
        "storage_dispatch [W]",
        "pv_production [W]",
        "net_load_with_flex [W]",
        "net_load_without_flex [W]",
    ]]

def main(input_csv: str):
    if not os.path.exists(input_csv):
        raise FileNotFoundError(f"File non trovato: {input_csv}")

    # Load
    df = pd.read_csv(input_csv)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df["slot"] = df["timestamp"].dt.strftime("%H:%M")

    # Colonne base
    col_wo = "net_load_without_flex [W]"
    col_w  = "net_load_with_flex [W]"

    df[col_wo] = to_float_series(df[col_wo])
    df[col_w]  = to_float_series(df[col_w])

    # Group by slot
    g_wo = df.groupby("slot")[col_wo]
    g_w  = df.groupby("slot")[col_w]

    profiles = {
        "STD": g_wo.mean().sort_index(),
        "MAX": g_w.max().sort_index(),
        "MIN": g_w.min().sort_index(),
    }

    base_name = os.path.splitext(os.path.basename(input_csv))[0]
    out_dir = os.path.dirname(input_csv) or "."

    for label, series in profiles.items():
        out_df = build_output_df(series)
        out_path = os.path.join(out_dir, f"{base_name}_{label}.csv")
        out_df.to_csv(out_path, index=False)
        print(f"✔ Creato {out_path} ({len(out_df)} righe)")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python build_profiles.py <input_file.csv>")
        sys.exit(1)

    main(sys.argv[1])
