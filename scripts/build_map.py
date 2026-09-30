"""Slim the Natural Earth 1:110m country shapes down to what the globe needs.

Source: https://github.com/nvkelso/natural-earth-vector (public domain)
Output: data/world.geojson  (ISO code + name only, coordinates rounded to 0.01 deg)

Usage:  uv run python scripts/build_map.py
"""

import json
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
URL = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
       "geojson/ne_110m_admin_0_countries.geojson")


def round_coords(c):
    if isinstance(c[0], (int, float)):
        return [round(c[0], 2), round(c[1], 2)]
    return [round_coords(x) for x in c]


def main():
    src = requests.get(URL, timeout=60).json()
    features = []
    for f in src["features"]:
        p = f["properties"]
        if p["ISO_A2_EH"] == "AQ":  # Antarctica only clutters the globe
            continue
        # ISO_A2_EH fills in codes that ISO_A2 leaves as -99 (France, Norway)
        features.append({"type": "Feature",
                         "properties": {"code": p["ISO_A2_EH"], "name": p["NAME"]},
                         "geometry": {"type": f["geometry"]["type"],
                                      "coordinates": round_coords(f["geometry"]["coordinates"])}})
    out = ROOT / "data" / "world.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                              separators=(",", ":")))
    print(f"wrote {out.relative_to(ROOT)}: {len(features)} countries, {out.stat().st_size / 1e3:.0f} KB")


if __name__ == "__main__":
    main()
