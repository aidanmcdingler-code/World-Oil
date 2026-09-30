"""Turn the raw JODI CSVs into one tidy panel: one row per country, month and oil product.

Input:  data/raw/primary_*.csv, data/raw/secondary_*.csv   (from download_jodi.py)
        data/countries.csv                                  (names, regions, OPEC groups)
Output: data/oil_panel.csv

Usage:  uv run python scripts/build_panel.py
"""

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "oil_panel.csv"

# JODI flow code -> panel column. Flows are in thousand barrels per day (KBD);
# closing stocks are a level, so they are in thousand barrels (KBBL).
FLOWS_KBD = {
    "INDPROD": "production_kbd",  # crude/NGL: output from wells
    "REFGROUT": "production_kbd",  # refined products: refinery gross output
    "TOTIMPSB": "imports_kbd",
    "TOTEXPSB": "exports_kbd",
    "TOTDEMO": "demand_kbd",  # refined products only
    "REFINOBS": "refinery_intake_kbd",  # crude/NGL only
}
STOCKS_KBBL = {"CLOSTLV": "closing_stocks_kbbl"}

# Component products only. JODI's TOTCRUDE and TOTPRODS rows are totals of the
# components, and JETKERO (jet fuel) is an "of which" part of KEROSENE, so keeping
# any of them would double count whenever products are summed.
PRODUCTS = {
    "CRUDEOIL": ("Crude oil", "Crude & NGL"),
    "NGL": ("NGL", "Crude & NGL"),
    "OTHERCRUDE": ("Other crude inputs", "Crude & NGL"),
    "GASOLINE": ("Gasoline", "Refined products"),
    "GASDIES": ("Diesel & gasoil", "Refined products"),
    "KEROSENE": ("Kerosene & jet fuel", "Refined products"),
    "LPG": ("LPG", "Refined products"),
    "NAPHTHA": ("Naphtha", "Refined products"),
    "RESFUEL": ("Fuel oil", "Refined products"),
    "ONONSPEC": ("Other products", "Refined products"),
}

NUMERIC = ["production_kbd", "imports_kbd", "exports_kbd", "demand_kbd",
           "refinery_intake_kbd", "closing_stocks_kbbl"]


def load_raw():
    frames = []
    for path in sorted(RAW.glob("*.csv")):
        # JODI marks missing values as "-" (not available), ".." or "x" (not applicable)
        df = pd.read_csv(path, na_values=["-", "..", "x", ""], dtype={"OBS_VALUE": "float64"})
        frames.append(df)
        print(f"read {path.name}: {len(df):,} rows")
    return pd.concat(frames, ignore_index=True)


def main():
    raw = load_raw()
    print(f"raw total: {len(raw):,} rows")

    raw = raw[raw["ENERGY_PRODUCT"].isin(PRODUCTS)]
    keep = (
        (raw["FLOW_BREAKDOWN"].isin(FLOWS_KBD) & (raw["UNIT_MEASURE"] == "KBD"))
        | (raw["FLOW_BREAKDOWN"].isin(STOCKS_KBBL) & (raw["UNIT_MEASURE"] == "KBBL"))
    )
    raw = raw[keep].dropna(subset=["OBS_VALUE"])
    raw["column"] = raw["FLOW_BREAKDOWN"].map({**FLOWS_KBD, **STOCKS_KBBL})

    keys = ["REF_AREA", "TIME_PERIOD", "ENERGY_PRODUCT"]
    # each key/flow pair appears once, so "first" just reshapes long -> wide
    panel = raw.pivot_table(index=keys, columns="column", values="OBS_VALUE", aggfunc="first")
    panel = panel.reindex(columns=NUMERIC).reset_index()

    countries = pd.read_csv(ROOT / "data" / "countries.csv")
    panel = panel.merge(countries, left_on="REF_AREA", right_on="code", how="left", validate="m:1")
    missing = panel.loc[panel["country"].isna(), "REF_AREA"].unique()
    if len(missing):
        raise SystemExit(f"countries.csv is missing codes: {missing}")

    panel["product"] = panel["ENERGY_PRODUCT"].map(lambda p: PRODUCTS[p][0])
    panel["product_group"] = panel["ENERGY_PRODUCT"].map(lambda p: PRODUCTS[p][1])
    panel["date"] = panel["TIME_PERIOD"]
    panel["year"] = panel["date"].str[:4].astype(int)

    out = panel[["date", "year", "code", "country", "region", "opec_group",
                 "product", "product_group", *NUMERIC]]
    out = out.sort_values(["date", "code", "product"]).reset_index(drop=True)
    out[NUMERIC] = out[NUMERIC].round(1)
    out.to_csv(OUT, index=False)

    print(f"wrote {OUT.relative_to(ROOT)}: {len(out):,} rows x {out.shape[1]} columns, "
          f"{OUT.stat().st_size / 1e6:.1f} MB")
    print(f"months: {out['date'].nunique()} ({out['date'].min()} to {out['date'].max()}), "
          f"countries: {out['code'].nunique()}, products: {out['product'].nunique()}")


if __name__ == "__main__":
    main()
