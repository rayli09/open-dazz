#!/usr/bin/env python3
"""Generate library/catalog.json from the library tree.

Layout contract (see library/README.md):
  library/<brand>/official/recipes/*.json   — first-party looks, listed first
  library/<brand>/community/recipes/*.json  — community recipes
Ordering: brands alphabetical; official before community; then by name.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT / "library"

def main():
    catalog = {"brands": {}, "totalLooks": 0}
    for brand_dir in sorted(p for p in LIB.iterdir() if p.is_dir()):
        brand = {"tiers": {}, "total": 0}
        for tier in ("official", "community"):
            entries = []
            rdir = brand_dir / tier / "recipes"
            if rdir.is_dir():
                for f in sorted(rdir.glob("*.json")):
                    r = json.loads(f.read_text())
                    prov = r.get("provenance", {})
                    entries.append({
                        "id": f"{brand_dir.name}/{tier}/{f.stem}",
                        "name": r["name"],
                        "brand": brand_dir.name,
                        "tier": tier,
                        "recipe": str(f.relative_to(ROOT)),
                        "baseLut": r.get("baseLut"),
                        "hasLut": r.get("baseLut") is not None,
                        "baseFilm": prov.get("film"),
                        "creator": prov.get("creator"),
                        "license": r.get("license"),
                    })
            entries.sort(key=lambda e: e["name"])
            brand["tiers"][tier] = entries
            brand["total"] += len(entries)
        catalog["brands"][brand_dir.name] = brand
        catalog["totalLooks"] += brand["total"]
    (LIB / "catalog.json").write_text(json.dumps(catalog, indent=2) + "\n")
    print(f"catalog: {catalog['totalLooks']} looks across {len(catalog['brands'])} brand(s)")

if __name__ == "__main__":
    main()
