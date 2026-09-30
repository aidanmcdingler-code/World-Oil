# World Oil

A two-page data website on world oil production, trade and demand, built by **Aidan Dingler** for the
Financial Data Analytics Data Website Project.

- **Live site:** https://aidanmcdingler-code.github.io/World-Oil/
- **Report** (`index.html`): headline numbers, nine findings with charts, an interactive 3D globe with country
  news, a live oil-stock chart, and a section on the data and methods.
- **Dashboard** (`dashboard.html`): loads the full data file in the browser, with filters (years, region, country,
  OPEC group, product group, product), switches for variable, measure and breakdown, five summary numbers, four
  charts, a clickable globe, a data table and a reset button.

## Data

**Source:** [JODI Oil World Database](https://www.jodidata.org/oil/database/data-downloads.aspx) (Joint
Organisations Data Initiative: APEC, Eurostat, GECF, IEA, IEF, OLADE, OPEC and the UN). It holds monthly oil
statistics that national governments report, downloaded as yearly CSV files for 2010–2026. The "primary" files
cover crude oil and NGL, and the "secondary" files cover refined products.

**Cleaned file:** `data/oil_panel.csv`, a panel with **one row per country, month and product**: 162,141 rows,
14 columns, 112 countries and 199 months (2010-01 to 2026-07).

| Column | Type | Meaning |
|---|---|---|
| `date`, `year` | time | Month (YYYY-MM) and year |
| `code`, `country` | group | ISO country code and name |
| `region`, `opec_group` | categorical | World region; OPEC / OPEC+ partner / Non-OPEC (2025 membership) |
| `product`, `product_group` | categorical | Oil product; "Crude & NGL" or "Refined products" |
| `production_kbd` | numeric | Well output (crude/NGL) or refinery output (products), thousand barrels/day |
| `imports_kbd`, `exports_kbd` | numeric | Total imports and exports, thousand barrels/day |
| `demand_kbd` | numeric | Total demand (refined products only), thousand barrels/day |
| `refinery_intake_kbd` | numeric | Crude/NGL fed into refineries, thousand barrels/day |
| `closing_stocks_kbbl` | numeric | End-of-month stocks, thousand barrels |

Missing values (`-`, `..`, `x` in the raw files) are left empty. JODI's total rows and the jet fuel subset of
kerosene are dropped so that products never double count. Several large producers (Russia, Iraq, Iran, the UAE,
Brazil and others) stop reporting partway through, so the report computes totals only over countries with
complete records. The report's "About the data" section has the details.

## Files

| File | What it does |
|---|---|
| `index.html` | Report page |
| `dashboard.html` | Dashboard page |
| `assets/css/style.css` | Shared fonts, colors, layout and animation styles for both pages |
| `assets/js/theme.js` | Shared chart styling, color assignment, number formatting, count-ups, scroll reveal and globe styling (`window.OilTheme`) |
| `assets/js/common.js` | Shared live stock ticker tape (TradingView widget) and small helpers |
| `assets/js/report.js` | Report page: fills every number from `data/report.json`, draws the finding charts, runs the globe and news panel |
| `assets/js/dashboard.js` | Dashboard: loads `data/oil_panel.csv`, applies filters, computes every stat, chart and table in the browser |
| `data/oil_panel.csv` | The cleaned panel data set (see above) |
| `data/countries.csv` | Country code → name, region and OPEC group lookup |
| `data/report.json` | Every number and chart series in the report, written by `scripts/analyze.py` |
| `data/globe.json` | Per-country figures for the report globe, written by `scripts/analyze.py` |
| `data/world.geojson` | Country outlines for the globes (Natural Earth 1:110m, public domain), written by `scripts/build_map.py` |
| `data/news.json` | Recent oil headlines per country from Google News, written by `scripts/fetch_news.py` |
| `scripts/download_jodi.py` | Downloads the raw JODI CSVs into `data/raw/` (git-ignored, about 600 MB) |
| `scripts/build_panel.py` | Cleans and reshapes the raw files into `data/oil_panel.csv` |
| `scripts/analyze.py` | Computes the report's findings and globe figures, and checks that each country series is complete |
| `scripts/build_map.py` | Slims the Natural Earth country shapes into `data/world.geojson` |
| `scripts/fetch_news.py` | Fetches the country news headlines |
| `.github/workflows/news.yml` | GitHub Action that reruns `fetch_news.py` every 6 hours and commits the result |
| `pyproject.toml`, `uv.lock` | Python project and pinned dependencies (pandas, requests) |
| `.gitignore` | Keeps the virtual environment and raw downloads out of the repo |

## Reproduce

```sh
uv sync
uv run python scripts/download_jodi.py   # raw CSVs -> data/raw/
uv run python scripts/build_panel.py     # -> data/oil_panel.csv
uv run python scripts/analyze.py         # -> data/report.json, data/globe.json
uv run python scripts/build_map.py       # -> data/world.geojson
uv run python scripts/fetch_news.py      # -> data/news.json (optional)
```

Stock prices on the site come live from TradingView widgets, and the headlines come from Google News. Neither
feeds any number in the report or dashboard.
