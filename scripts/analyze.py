"""Compute every number and chart series on the report page from data/oil_panel.csv.

Output: data/report.json  (headline numbers, finding numbers, chart series)
        data/globe.json   (per-country figures for the 3D globe)

The report page reads these files, so the numbers in the text and the charts
always match the data. Rerun after rebuilding the panel:

Usage:  uv run python scripts/analyze.py
"""

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
FIRST, LAST = "2010-01", "2025-12"  # full calendar years; 2026 is still partial
N_MONTHS = 192


def annual_avg(frame, col):
    """Average of monthly kb/d values within each calendar year."""
    return frame.groupby("year")[col].mean()


def pct(new, old):
    return (new / old - 1) * 100


def r(x, nd=0):
    return round(float(x), nd)


def series(s, nd=0):
    return {"labels": [str(i) for i in s.index], "values": [r(v, nd) for v in s.values]}


def main():
    panel = pd.read_csv(ROOT / "data" / "oil_panel.csv")
    d = panel[(panel["date"] >= FIRST) & (panel["date"] <= LAST)]
    crude = d[d["product"] == "Crude oil"]

    def country(code, col):
        s = crude[crude["code"] == code].dropna(subset=[col])
        assert s["date"].nunique() == N_MONTHS, f"{code} {col} is missing months"
        return s

    facts, charts = {}, {}

    # Balanced set: countries with crude production in every month 2010-2025
    months = crude.dropna(subset=["production_kbd"]).groupby("code")["date"].nunique()
    full = months[months == N_MONTHS].index
    bal = crude[crude["code"].isin(full)]
    bal_total = bal.groupby("year")["production_kbd"].sum() / 12
    facts["balanced_n"] = len(full)

    # 1. US output
    us = annual_avg(country("US", "production_kbd"), "production_kbd")
    sa = annual_avg(country("SA", "production_kbd"), "production_kbd")
    ca = annual_avg(country("CA", "production_kbd"), "production_kbd")
    facts |= {"us_prod_2010": r(us[2010]), "us_prod_2025": r(us[2025]),
              "us_prod_growth": r(pct(us[2025], us[2010])),
              "sa_prod_2025": r(sa[2025]),
              "us_pass_sa_year": int(us[us > sa].index.min())}
    charts["us_vs_leaders"] = {"labels": [str(y) for y in us.index], "series": {
        "United States": [r(v) for v in us], "Saudi Arabia": [r(v) for v in sa],
        "Canada": [r(v) for v in ca]}}

    # 2. US share of the balanced set
    share = us / bal_total * 100
    others = bal_total - us
    facts |= {"us_share_2010": r(share[2010], 1), "us_share_2025": r(share[2025], 1),
              "bal_total_2025": r(bal_total[2025]),
              "others_2010": r(others[2010]), "others_2025": r(others[2025]),
              "others_change": r(pct(others[2025], others[2010]), 1)}
    charts["us_share"] = {"labels": [str(y) for y in us.index], "series": {
        "United States": [r(v) for v in us], "Other 50 countries": [r(v) for v in bal_total - us]}}
    assert len(full) == 51, "chart label 'Other 50 countries' assumes 51 countries"

    # 3. US crude exports
    usx = annual_avg(country("US", "exports_kbd"), "exports_kbd")
    sax = annual_avg(country("SA", "exports_kbd"), "exports_kbd")
    facts |= {"us_exp_2010": r(usx[2010]), "us_exp_2015": r(usx[2015]),
              "us_exp_2025": r(usx[2025]), "sa_exp_2025": r(sax[2025])}
    exp25 = crude[crude["year"] == 2025].groupby("country")["exports_kbd"].agg(["mean", "count"])
    exp25 = exp25[exp25["count"] == 12]["mean"].sort_values(ascending=False)
    facts["us_exp_rank_2025"] = int(list(exp25.index).index("United States") + 1)
    charts["us_exports"] = series(usx)

    # 4. China vs US crude imports
    cni = annual_avg(country("CN", "imports_kbd"), "imports_kbd")
    usi = annual_avg(country("US", "imports_kbd"), "imports_kbd")
    facts |= {"cn_imp_2010": r(cni[2010]), "cn_imp_2025": r(cni[2025]),
              "cn_imp_growth": r(pct(cni[2025], cni[2010])),
              "us_imp_2010": r(usi[2010]), "us_imp_2025": r(usi[2025]),
              "cn_pass_us_imp_year": int(cni[cni > usi].index.min())}
    cnr = annual_avg(country("CN", "refinery_intake_kbd"), "refinery_intake_kbd")
    usr = annual_avg(country("US", "refinery_intake_kbd"), "refinery_intake_kbd")
    facts |= {"cn_runs_2025": r(cnr[2025]), "us_runs_2025": r(usr[2025]),
              "cn_runs_pct_us": r(cnr[2025] / usr[2025] * 100)}
    charts["imports"] = {"labels": [str(y) for y in cni.index], "series": {
        "China": [r(v) for v in cni], "United States": [r(v) for v in usi]}}

    # 5 + 6. Refined-product demand: countries reporting every product every month
    prods = d[d["product_group"] == "Refined products"]
    n_prod = prods["product"].nunique()
    cnt = prods.dropna(subset=["demand_kbd"]).groupby(["code", "product"])["date"].nunique()
    per_country = (cnt == N_MONTHS).groupby("code").sum()
    demand_set = per_country[per_country == n_prod].index
    dem = (prods[prods["code"].isin(demand_set)]
           .groupby(["date", "product"])["demand_kbd"].sum().unstack())
    dem["All products"] = dem.sum(axis=1)
    covid = pct(dem.loc["2020-04"], dem.loc["2019-04"]).sort_values()
    facts |= {"demand_n": len(demand_set),
              "covid_all": r(covid["All products"], 1),
              "covid_jet": r(covid["Kerosene & jet fuel"], 1),
              "covid_gasoline": r(covid["Gasoline"], 1),
              "covid_diesel": r(covid["Diesel & gasoil"], 1)}
    charts["covid"] = series(covid, 1)
    by_year = dem.groupby(dem.index.str[:4]).mean()
    for prod, key in [("Gasoline", "gasoline"), ("Diesel & gasoil", "diesel")]:
        facts[f"{key}_2022_vs_2019"] = r(pct(by_year.at["2022", prod], by_year.at["2019", prod]), 1)

    jet = dem["Kerosene & jet fuel"]
    jet_vs_2019 = pd.Series({dt: pct(jet[dt], jet[f"2019-{dt[5:]}"])
                             for dt in jet.index if dt >= "2020-01"})
    back = jet_vs_2019[jet_vs_2019 >= 0]
    facts |= {"jet_first_back": back.index.min(),
              "jet_2021": r(pct(jet[jet.index.str.startswith("2021")].sum(),
                                jet[jet.index.str.startswith("2019")].sum()), 1)}
    charts["jet_recovery"] = series(jet_vs_2019, 1)

    # 7. Saudi Arabia as swing producer (monthly)
    sam = country("SA", "production_kbd").set_index("date")["production_kbd"]
    facts |= {"sa_2022": r(sa[2022]), "sa_2024": r(sa[2024]),
              "sa_cut": r(pct(sa[2024], sa[2022]), 1),
              "sa_peak_month": sam.idxmax(), "sa_peak": r(sam.max())}
    charts["saudi_monthly"] = {"labels": list(sam.index), "values": [r(v) for v in sam]}

    # 8. Venezuela
    ve = annual_avg(country("VE", "production_kbd"), "production_kbd")
    low = ve.idxmin()
    facts |= {"ve_2010": r(ve[2010]), "ve_low_year": int(low), "ve_low": r(ve[low]),
              "ve_drop": r(pct(ve[low], ve[2010])), "ve_2025": r(ve[2025])}
    charts["venezuela"] = series(ve)

    # 9. North Sea: UK vs Norway
    gb = annual_avg(country("GB", "production_kbd"), "production_kbd")
    no = annual_avg(country("NO", "production_kbd"), "production_kbd")
    no_low = no.idxmin()
    facts |= {"gb_2010": r(gb[2010]), "gb_2025": r(gb[2025]), "gb_drop": r(pct(gb[2025], gb[2010])),
              "no_low_year": int(no_low), "no_low": r(no[no_low]), "no_2025": r(no[2025]),
              "no_rebound": r(pct(no[2025], no[no_low]))}
    charts["north_sea"] = {"labels": [str(y) for y in gb.index], "series": {
        "Norway": [r(v) for v in no], "United Kingdom": [r(v) for v in gb]}}

    # Headline block / dataset description
    facts |= {"rows": len(panel), "columns": panel.shape[1], "last_full_year": int(LAST[:4]),
              "countries": int(panel["code"].nunique()), "months": int(panel["date"].nunique()),
              "first_month": panel["date"].min(), "last_month": panel["date"].max()}

    (ROOT / "data" / "report.json").write_text(json.dumps({"facts": facts, "charts": charts}, indent=1))
    print(json.dumps(facts, indent=1))

    # Globe: per-country annual averages for every year 2010-2025, for the time slider.
    # A value is only given for a year when all 12 months are reported, so a missing
    # report never shows up as a low number.
    measures = {"p": "production_kbd", "x": "exports_kbd", "m": "imports_kbd"}
    countries = {}
    # every country in the panel gets an entry, even with no crude rows, so the globe
    # can tell "reports to JODI but no crude data" apart from "not in JODI"
    for code, row in panel.drop_duplicates("code").set_index("code").iterrows():
        g = crude[crude["code"] == code]
        years = {}
        for y, gy in g.groupby("year"):
            vals = {k: r(gy[col].mean()) for k, col in measures.items()
                    if gy[col].notna().sum() == 12}
            if vals:
                years[str(y)] = vals
        countries[code] = {"country": row["country"], "region": row["region"],
                           "opec": row["opec_group"], "years": years}
    all_vals = lambda k: [v[k] for c in countries.values() for v in c["years"].values() if k in v]
    meta = {"first": int(FIRST[:4]), "last": int(LAST[:4]),
            "max": {k: max(all_vals(k)) for k in measures}}
    (ROOT / "data" / "globe.json").write_text(
        json.dumps({"meta": meta, "countries": countries}, separators=(",", ":")))
    have = sum(1 for c in countries.values() if "p" in c["years"].get(str(meta["last"]), {}))
    print(f"globe.json: {len(countries)} countries, {have} with full {meta['last']} production")

if __name__ == "__main__":
    main()
