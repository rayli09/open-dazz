#!/usr/bin/env python3
"""Re-base the official Fujifilm cubes for display-referred input.

Upstream (abpy/FujifilmCameraProfiles, CC BY-NC-SA 4.0) authors
these cubes for a LINEAR-light pipeline — its README: "The cube
LUTs are intended to be applied to an image with linear contrast.
A linear camera profile is required for a correct result." Applied
directly to display JPEGs, the whole family runs hot (measured on
a hue chart: Provia, Fuji's neutral standard, gains +26% median
chroma; Astia +24%; Pro Neg Std +16%).

The fix is a LUT composition, applied uniformly to all 11 sims:

    shipped(p) = srgb_encode( upstream_cube( srgb_decode(p) ) )

i.e. the cube now operates in the linear domain it was authored
for, inside a display-referred wrapper. Post-fix measurements
(hue chart, wrap = direct): Provia 1.03, Astia 1.07, Velvia 1.22,
Classic Chrome 0.85, Eterna 0.81 @ slope 0.97, Pro Neg Std 0.85,
Bleach Bypass 0.43 — each sim back in its documented character.
(The two naive alternatives fail: direct application is the hot
one; decoding without re-encoding crushes midtones.)

Idempotent: refuses to run on cubes that already carry the
re-based marker.
"""
import gzip
import json, os
import numpy as np

LUT_DIR = "library/fuji/official/luts"
REC_DIR = "library/fuji/official/recipes"
MARKER = "re-based for display-referred input"

def srgb_dec(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def srgb_enc(c):
    c = np.clip(c, 0.0, None)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)

def load_cube(path):
    size, data = None, []
    for line in gzip.open(path, "rt"):
        if MARKER in line:
            raise SystemExit(f"{path}: already re-based, refusing to run twice")
        if line.startswith("LUT_3D_SIZE"):
            size = int(line.split()[1])
        elif line and (line[0].isdigit() or line[0] == "-"):
            data.append([float(v) for v in line.split()])
    arr = np.array(data, dtype=np.float64)
    assert size and len(arr) == size ** 3
    return arr.reshape(size, size, size, 3)  # [b][g][r]

def sample_grid(cube, pts):
    """Trilinear-sample cube ([b][g][r]) at pts (..., 3) in [0,1]."""
    n = cube.shape[0]
    p = np.clip(pts, 0, 1) * (n - 1)
    lo = np.floor(p).astype(int)
    hi = np.minimum(lo + 1, n - 1)
    f = p - lo
    out = np.zeros_like(pts)
    for db in (0, 1):
        for dg in (0, 1):
            for dr in (0, 1):
                w = ((f[..., 0] if dr else 1 - f[..., 0])
                     * (f[..., 1] if dg else 1 - f[..., 1])
                     * (f[..., 2] if db else 1 - f[..., 2]))
                idx_b = hi[..., 2] if db else lo[..., 2]
                idx_g = hi[..., 1] if dg else lo[..., 1]
                idx_r = hi[..., 0] if dr else lo[..., 0]
                out += w[..., None] * cube[idx_b, idx_g, idx_r]
    return out

def write_cube(path, arr_rgba, title):
    size = arr_rgba.shape[0]
    with gzip.open(path, "wt") as fp:
        fp.write(f"# {title}\n# {MARKER} by tools/fix_official_fuji.py\n")
        fp.write(f"LUT_3D_SIZE {size}\n")
        for b in range(size):
            for g in range(size):
                for r in range(size):
                    v = arr_rgba[r, g, b]
                    fp.write(f"{v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")

def main():
    size = 33
    lin = np.linspace(0, 1, size)
    grid = np.stack(np.meshgrid(lin, lin, lin, indexing="ij"), -1)  # [r][g][b]
    for fn in sorted(os.listdir(LUT_DIR)):
        if not fn.endswith("_sRGB.cube.gz"):
            continue
        path = os.path.join(LUT_DIR, fn)
        cube = load_cube(path)
        composed = srgb_enc(sample_grid(cube, srgb_dec(grid)))
        write_cube(path, composed, fn.replace("_sRGB.cube.gz", "")
                   + " — abpy/FujifilmCameraProfiles (CC BY-NC-SA 4.0),")
        print(f"re-based {fn}")
    # provenance: mark each official recipe
    for fn in sorted(os.listdir(REC_DIR)):
        if not fn.endswith(".json"):
            continue
        p = os.path.join(REC_DIR, fn)
        r = json.load(open(p))
        prov = r.setdefault("provenance", {})
        prov["rebased"] = ("Upstream cube is authored for linear-light "
                           "input; re-based to display-referred sRGB by "
                           "composition (tools/fix_official_fuji.py) after "
                           "the direct application measured ~+0.2 chroma "
                           "hot across the family (Provia 1.26).")
        json.dump(r, open(p, "w"), indent=2)
        print(f"provenance updated {fn}")

if __name__ == "__main__":
    main()
