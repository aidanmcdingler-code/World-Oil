"""Download the raw JODI Oil World Database CSVs (primary + secondary products).

Source: Joint Organisations Data Initiative, https://www.jodidata.org/oil/database/data-downloads.aspx
Files land in data/raw/ (git-ignored because they are large; rerun this script to rebuild them).

Usage:  uv run python scripts/download_jodi.py
"""

from pathlib import Path

import requests

BASE = "https://www.jodidata.org/_resources/files/downloads/oil-data/annual-csv"
FIRST_YEAR = 2010
LAST_FULL_YEAR = 2025  # the current year is published as "<kind>year2026.csv"
CURRENT_YEAR = 2026

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"


def file_urls():
    for kind in ("primary", "secondary"):
        for year in range(FIRST_YEAR, LAST_FULL_YEAR + 1):
            yield kind, year, f"{BASE}/{kind}/{year}.csv"
        yield kind, CURRENT_YEAR, f"{BASE}/{kind}/{kind}year{CURRENT_YEAR}.csv"


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    for kind, year, url in file_urls():
        out = RAW / f"{kind}_{year}.csv"
        resp = requests.get(url, timeout=120)
        resp.raise_for_status()
        out.write_bytes(resp.content)
        print(f"{out.name}: {len(resp.content) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
