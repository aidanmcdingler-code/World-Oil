"""Fetch recent oil headlines for each country from Google News RSS.

Output: data/news.json  {country code: [{title, source, link, date}, ...]}

The site is static, and a browser can't read Google News directly (no CORS),
so a scheduled GitHub Action (.github/workflows/news.yml) runs this script and
commits the result. The news is a live extra: no report or dashboard number
depends on it.

Usage:  uv run python scripts/fetch_news.py
"""

import csv
import json
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import quote_plus

import requests

ROOT = Path(__file__).resolve().parent.parent
PER_COUNTRY = 5


def headlines(name):
    query = quote_plus(f'"{name}" oil when:30d')
    url = f"https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"
    resp = requests.get(url, timeout=30, headers={"User-Agent": "world-oil-site/1.0"})
    resp.raise_for_status()
    items = []
    for item in list(ET.fromstring(resp.content).iter("item"))[: PER_COUNTRY * 3]:
        source = item.findtext("source") or ""
        title = item.findtext("title") or ""
        if source and title.endswith(f" - {source}"):
            title = title[: -len(source) - 3]
        date = parsedate_to_datetime(item.findtext("pubDate")).date().isoformat()
        items.append({"title": title, "source": source, "link": item.findtext("link"), "date": date})
    return sorted(items, key=lambda i: i["date"], reverse=True)[:PER_COUNTRY]


def main():
    countries = list(csv.DictReader(open(ROOT / "data" / "countries.csv", encoding="utf-8")))
    news = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), "countries": {}}
    for row in countries:
        try:
            news["countries"][row["code"]] = headlines(row["country"])
        except Exception as e:  # one failed country shouldn't sink the whole update
            print(f"{row['country']}: {e}")
        time.sleep(1)
    (ROOT / "data" / "news.json").write_text(json.dumps(news, indent=0, ensure_ascii=False),
                                              encoding="utf-8")
    print(f"news for {len(news['countries'])} countries")


if __name__ == "__main__":
    main()
