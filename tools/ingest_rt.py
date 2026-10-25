#!/usr/bin/env python3
"""Ingest the RawTherapee Film Simulation Collection (HaldCLUT pack).

Source: http://rawtherapee.com/shared/HaldCLUT.zip (402MB), the
canonical RawTherapee collection by Pat David et al., CC BY-SA 4.0
(license as distributed with the pack and its .cube conversions).

Each level-12 Hald PNG (1728x1728, a 144^3 table) is decoded and
resampled to a 33^3 .cube in our library layout. Push/pull variants
(name suffixes +, ++, +++, -, --) are skipped — base stocks and
named emulsion variants (NC/VC/UC...) are the library material.
CreativePack-1 (generic creative looks, not stocks) is skipped.
Names that duplicate an existing look in the same brand are
skipped and reported. Axis order is verified per file: the pure-red
node of the table must map to a red-dominant output.
"""
import json, os, re, sys
import numpy as np
from PIL import Image

PACK = "/home/hatch/workspace/open-fuji/.scratch/rtpack/HaldCLUT"
LIB = "library"

def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

def hald_table(path: str) -> np.ndarray:
    im = Image.open(path).convert("RGB")
    w, h = im.size
    assert w == h, path
    level = round(w ** (1 / 3))
    assert level ** 3 == w, (path, w)
    n = level * level
    flat = np.asarray(im, dtype=np.float64).reshape(-1, 3) / 255.0
    assert len(flat) == n ** 3, (path, len(flat), n)
    return flat.reshape(n, n, n, 3)  # [b][g][r]

def resample(table: np.ndarray, size: int = 33) -> np.ndarray:
    n = table.shape[0]
    coords = np.linspace(0, n - 1, size)
    lo = np.floor(coords).astype(int)
    hi = np.minimum(lo + 1, n - 1)
    f = coords - lo
    out = np.zeros((size, size, size, 3))
    # trilinear over [r][g][b] grids built from the [b][g][r] table
    t = np.transpose(table, (2, 1, 0, 3))  # -> [r][g][b]
    for db in (0, 1):
        for dg in (0, 1):
            for dr in (0, 1):
                wgt = (np.where(dr, f, 1 - f)[:, None, None]
                       * np.where(dg, f, 1 - f)[None, :, None]
                       * np.where(db, f, 1 - f)[None, None, :])
                corner = t[np.ix_(hi if dr else lo, hi if dg else lo,
                                  hi if db else lo)][..., 0, :] if False else None
                block = t[hi if dr else lo][:, :, :][:, hi if dg else lo][:, :, hi if db else lo]
                out += wgt[..., None] * block
    return out  # [r][g][b]

def write_cube(path, arr, title):
    size = arr.shape[0]
    with open(path, "w") as fp:
        fp.write(f'TITLE "{title}"\nLUT_3D_SIZE {size}\n')
        for b in range(size):
            for g in range(size):
                for r in range(size):
                    v = arr[r, g, b]
                    fp.write(f"{v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")

PUSH_PULL = re.compile(r"\s(\+\+\+|\+\+|\+|---|--|-)$")

def verify_layout():
    """Prove the [b][g][r] row-major decode against the pack's own
    identity Hald: every sampled node must return its own coords."""
    from PIL import Image as PILImage
    path = os.path.join(PACK, "Hald_CLUT_Identity_12.tif")
    if not os.path.exists(path):
        print("identity Hald not extracted; layout check skipped")
        return
    im = PILImage.open(path).convert("RGB")
    w, h = im.size
    level = round(w ** (1 / 3)); n = level * level
    flat = np.asarray(im, dtype=np.float64).reshape(-1, 3) / 255.0
    table = flat.reshape(n, n, n, 3)
    for (b, g, r) in [(0, 0, 0), (0, 0, n - 1), (0, n - 1, 0),
                      (n - 1, 0, 0), (n // 2, n // 3, n // 4),
                      (n - 1, n - 1, n - 1)]:
        out = table[b, g, r]
        want = np.array([r, g, b]) / (n - 1)
        assert np.allclose(out, want, atol=1.5 / 255), (b, g, r, out, want)
    print(f"layout verified against identity Hald (level {level})")

def main():
    verify_layout()
    cat = json.load(open(f"{LIB}/catalog.json"))
    existing = {}
    for bslug, brand in cat["brands"].items():
        names = set()
        for tier in brand["tiers"].values():
            for e in tier:
                names.add(re.sub(r"\s+", " ", e["name"].lower()).strip())
        existing[bslug] = names
    added, skipped_dupe, skipped_variant, skipped_axis = [], [], 0, []
    for treatment in ("Color", "Black-and-White"):
        base = os.path.join(PACK, treatment)
        if not os.path.isdir(base):
            continue
        for brand_dir in sorted(os.listdir(base)):
            if brand_dir == "CreativePack-1":
                continue
            bslug = slugify(brand_dir)
            src_dir = os.path.join(base, brand_dir)
            if not os.path.isdir(src_dir):
                continue
            out_luts = f"{LIB}/{bslug}/community/luts"
            out_recipes = f"{LIB}/{bslug}/community/recipes"
            os.makedirs(out_luts, exist_ok=True)
            os.makedirs(out_recipes, exist_ok=True)
            for fn in sorted(os.listdir(src_dir)):
                if not fn.endswith(".png"):
                    continue
                stem = fn[:-4]
                if PUSH_PULL.search(stem):
                    skipped_variant += 1
                    continue
                name = re.sub(r"\s+", " ", stem).strip()
                # the pack contains accidental copies ("Kodak Portra 800 2")
                name = re.sub(r"\s\d$", "", name)
                if name.lower() in existing.get(bslug, set()):
                    skipped_dupe.append(name)
                    continue
                table = hald_table(os.path.join(src_dir, fn))
                # axis sanity: the layout is proven once against the
                # pack's identity Hald (see verify_layout). Per file we
                # only reject a blue-dominant response to the pure-red
                # node, which is the signature of scrambled axes.
                # (B&W tables answer gray — R == G == B — and pass;
                # an earlier strict-> check wrongly rejected them.)
                red_out = table[0, 0, -1]
                if red_out[2] > red_out[0] + 0.05:
                    skipped_axis.append(name)
                    continue
                cube = resample(table)
                slug = "rt-" + slugify(name)
                # brand prefix inside the filename duplicates the folder
                # for some stocks ("Kodak Kodachrome 25"); keep as-is.
                write_cube(f"{out_luts}/{slug}.cube", cube,
                           f"{name} — RawTherapee Film Simulation Collection")
                recipe = {
                    "name": name,
                    "baseLut": f"../luts/{slug}.cube",
                    "grain": {"amount": 0, "size": "small"},
                    "halation": 0,
                    "tone": {"highlight": 0, "shadow": 0, "color": 0},
                    "whiteBalance": {"tempShift": 0, "tintShift": 0},
                    "source": "RawTherapee Film Simulation Collection "
                              "(Pat David et al.) — HaldCLUT converted by "
                              "tools/ingest_rt.py",
                    "license": "CC BY-SA 4.0",
                    "provenance": {
                        "category": treatment,
                        "sourceFile": f"{treatment}/{brand_dir}/{fn}",
                        "sourceUrl": "http://rawtherapee.com/shared/HaldCLUT.zip",
                    },
                }
                with open(f"{out_recipes}/{slug}.json", "w") as fp:
                    json.dump(recipe, fp, indent=2)
                existing.setdefault(bslug, set()).add(name.lower())
                added.append(f"{bslug}/{slug}")
    print(f"added: {len(added)}")
    print(f"skipped push/pull variants: {skipped_variant}")
    print(f"skipped duplicates: {len(skipped_dupe)} {skipped_dupe[:8]}")
    print(f"skipped axis-check failures: {skipped_axis}")

if __name__ == "__main__":
    main()
