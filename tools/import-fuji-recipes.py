#!/usr/bin/env python3
"""Import matthieurobin/open-fuji-recipes (204 camera-setting recipes) into
open-fuji recipe JSONs under library/fuji/community/recipes/.

Usage: python3 tools/import-fuji-recipes.py /path/to/open-fuji-recipes

Mapping (schema v0):
  h-tone -> tone.highlight, s-tone -> tone.shadow, color -> tone.color (1:1)
  wbb (+-9) -> whiteBalance.tempShift = -wbb/9   (camera Blue-Amber axis, sign-flipped)
  wbr (+-9) -> whiteBalance.tintShift =  wbr/9   (LOSSY: Red-Cyan axis approximated as tint)
  grain: off -> 0, weak -> 0.25, strong -> 0.55; trailing ' l'/' s' -> size large/small
  film -> baseLut via the fuji-simulations pack where a cube exists
          (ACROS / MONOCHROME / SEPIA have none yet -> baseLut null, see provenance)
  dr, ev, ccfx, ccfxb, sharp, clarity, nr, wb mode, sensor, type -> provenance only
"""
import json, re, sys, unicodedata
from pathlib import Path

SRC = Path(sys.argv[1]) / "src/stores/data/recipes.js"
OUT = Path(__file__).resolve().parent.parent / "library/fuji/community/recipes"

FILM_TO_LUT = {
    # B&W bases: Sowerby Hald conversions (GPL-3.0, segregated folder)
    "ACROS": "../hald-bases/luts/acros.cube",
    "ACROS +Y": "../hald-bases/luts/acros-ye.cube",
    "ACROS +R": "../hald-bases/luts/acros-r.cube",
    "ACROS +G": "../hald-bases/luts/acros-g.cube",
    "MONOCHROME": "../hald-bases/luts/mono.cube",
    "MONOCHROME +Y": "../hald-bases/luts/mono-ye.cube",
    "MONOCHROME +R": "../hald-bases/luts/mono-r.cube",
    "MONOCHROME +G": "../hald-bases/luts/mono-g.cube",
    "SEPIA": "../hald-bases/luts/sepia.cube",
    "PROVIA/Standard": "provia_sRGB.cube",
    "VELVIA/Vivid": "velvia_sRGB.cube",
    "ASTIA/Soft": "astia_sRGB.cube",
    "Classic Chrome": "classic chrome_sRGB.cube",
    "Classic Neg": "classic neg_sRGB.cube",
    "ETERNA/Cinema": "eterna_sRGB.cube",
    "Pro Neg Hi": "pro neg hi_sRGB.cube",
    "Pro Neg Std": "pro neg std_sRGB.cube",
}
GRAIN = {"off": 0.0, "weak": 0.25, "strong": 0.55}

def slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "x"

def main():
    text = SRC.read_text()
    data = json.loads(text[text.index("["): text.rindex("]") + 1])
    OUT.mkdir(parents=True, exist_ok=True)
    with_lut = 0
    for r in data:
        g = str(r.get("grain", "off")).strip().lower()
        size = "small"
        if g.endswith(" l"):
            g, size = g[:-2], "large"
        elif g.endswith(" s"):
            g = g[:-2]
        film = r.get("film", "")
        lut = FILM_TO_LUT.get(film)
        recipe = {
            "name": r["name"],
            "processing": "fujiPhotoV1",
            "baseLut": (lut if "/" in lut else f"../../official/luts/{lut}") if lut else None,
            "grain": {"amount": GRAIN.get(g, 0.0), "size": size},
            "halation": 0,
            "tone": {
                "highlight": r.get("h-tone", 0),
                "shadow": r.get("s-tone", 0),
                "color": r.get("color", 0),
            },
            "whiteBalance": {
                "tempShift": round(-(r.get("wbb", 0)) / 9, 3),
                "tintShift": round((r.get("wbr", 0)) / 9, 3),
            },
            "source": f"open-fuji-recipes: {film} recipe by {r.get('creator', 'unknown')}",
            "license": "Apache-2.0 (per upstream package.json)",
            "provenance": {
                "film": film,
                "creator": r.get("creator"),
                "type": r.get("type"),
                "sensor": r.get("sensor"),
                "wbMode": r.get("wb"),
                "wbr": r.get("wbr"),
                "wbb": r.get("wbb"),
                "dr": r.get("dr"),
                "ev": r.get("ev"),
                "ccfx": r.get("ccfx"),
                "ccfxb": r.get("ccfxb"),
                "sharp": r.get("sharp"),
                "clarity": r.get("clarity"),
                "nr": r.get("nr"),
                "sourceId": r.get("id"),
                "sourceRepo": "https://github.com/matthieurobin/open-fuji-recipes",
                "notes": "wbr mapped to tintShift is approximate (Red-Cyan vs Green-Magenta axis). "
                         "ccfx/dr/ev/sharp/clarity/nr have no schema-v0 counterpart and are kept here only."
                         + ("" if lut else " No base LUT available yet for this film sim (B&W family) — params only."),
            },
        }
        if lut:
            with_lut += 1
        fname = f"{r['id']:03d}-{slug(r['name'])}-{slug(str(r.get('creator', '')))}.json"
        (OUT / fname).write_text(json.dumps(recipe, indent=2, ensure_ascii=False) + "\n")
    print(f"imported {len(data)} recipes, {with_lut} with a base LUT, {len(data) - with_lut} params-only")

if __name__ == "__main__":
    main()
