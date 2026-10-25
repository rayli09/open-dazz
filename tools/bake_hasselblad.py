#!/usr/bin/env python3
"""Re-base the V-Log-Alchemy Hasselblad cubes from V-Log input to
sRGB input, by LUT composition.

The upstream cubes (shenmintao/V-Log-Alchemy, Apache-2.0) map
Panasonic V-Log / V-Gamut code values to display sRGB, carrying a
reverse-engineered HNCS (Phocus/X2D) rendering. Our pipeline feeds
sRGB stills, so each output cube is:

    sRGB --EOTF--> linear Rec.709 --matrix--> linear V-Gamut
         --V-Log encode--> sample upstream cube --> sRGB out

Matrices are built from the published primaries exactly as the
upstream generator does (V-Gamut 0.730/0.280, 0.165/0.840,
0.100/-0.030; D65), and the V-Log curve uses Panasonic's reference
constants as they appear in the upstream generator
(cut 0.181, b 0.00873, c 0.241514, d 0.598206; linear leg 5.6x+0.125).
"""
import json, math, os
import numpy as np

SRC_DIR = os.path.expanduser("~/workspace/vlog-alchemy/Luts/Hasselblad")
OUT_DIR = "library/hasselblad/community"

def rgb_to_xyz_matrix(primaries, white):
    xr, yr, xg, yg, xb, yb = primaries
    def xyz(x, y): return np.array([x / y, 1.0, (1 - x - y) / y])
    M = np.column_stack([xyz(xr, yr), xyz(xg, yg), xyz(xb, yb)])
    S = np.linalg.solve(M, xyz(*white))
    return M * S

D65 = (0.3127, 0.3290)
VGAMUT = (0.730, 0.280, 0.165, 0.840, 0.100, -0.030)
REC709 = (0.640, 0.330, 0.300, 0.600, 0.150, 0.060)
M_709_TO_VGAMUT = (np.linalg.inv(rgb_to_xyz_matrix(VGAMUT, D65))
                   @ rgb_to_xyz_matrix(REC709, D65))

def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def vlog_encode(L):
    return np.where(L < 0.01, 5.6 * L + 0.125,
                    0.241514 * np.log10(np.maximum(L, 0) + 0.00873) + 0.598206)

def load_cube(path):
    size, data = None, []
    for line in open(path):
        if line.startswith("LUT_3D_SIZE"):
            size = int(line.split()[1])
        elif line and (line[0].isdigit() or line[0] == "-"):
            data.append([float(v) for v in line.split()])
    arr = np.array(data, dtype=np.float64)
    assert size and len(arr) == size ** 3, (path, size, len(arr))
    return arr.reshape(size, size, size, 3)  # [b][g][r] file order

def sample(cube, rgb):
    n = cube.shape[0]
    p = np.clip(rgb, 0.0, 1.0) * (n - 1)
    lo = np.floor(p).astype(int); hi = np.minimum(lo + 1, n - 1)
    f = p - lo
    out = np.zeros(3)
    for db in (0, 1):
        for dg in (0, 1):
            for dr in (0, 1):
                w = ((f[0] if dr else 1 - f[0]) * (f[1] if dg else 1 - f[1])
                     * (f[2] if db else 1 - f[2]))
                out += w * cube[hi[2] if db else lo[2], hi[1] if dg else lo[1],
                                hi[0] if dr else lo[0]]
    return out

def compose(src_cube, size=33):
    lin = np.linspace(0, 1, size)
    grid = np.stack(np.meshgrid(lin, lin, lin, indexing="ij"), -1)  # [r][g][b]
    flat = grid.reshape(-1, 3)
    lin709 = srgb_to_linear(flat)
    lin_vg = lin709 @ M_709_TO_VGAMUT.T
    enc = np.clip(vlog_encode(np.maximum(lin_vg, 0.0)), 0.0, 1.0)
    out = np.array([sample(src_cube, v) for v in enc])
    return out.reshape(size, size, size, 3)  # [r][g][b]

def write_cube(path, arr, title):
    size = arr.shape[0]
    with open(path, "w") as f:
        f.write(f'TITLE "{title}"\nLUT_3D_SIZE {size}\n')
        for b in range(size):
            for g in range(size):
                for r in range(size):
                    v = arr[r, g, b]
                    f.write(f"{v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")

STYLES = [
    ("Hasselblad_Standard_Phocus_X2D_VLog_sRGB.cube", "hasselblad-standard",
     "Hasselblad Standard (HNCS)"),
    ("Hasselblad_Nature_Phocus_X2D_VLog_sRGB.cube", "hasselblad-nature",
     "Hasselblad Nature (HNCS)"),
]

def main():
    os.makedirs(f"{OUT_DIR}/luts", exist_ok=True)
    os.makedirs(f"{OUT_DIR}/recipes", exist_ok=True)
    for src_name, slug, name in STYLES:
        src = load_cube(os.path.join(SRC_DIR, src_name))
        out = compose(src)
        # sanity: gray ramp stays near-neutral and monotonic
        ramp = [out[int(t * 32), int(t * 32), int(t * 32)] for t in
                (0.0, 0.25, 0.5, 0.75, 1.0)]
        spread = max(float(np.max(v) - np.min(v)) for v in ramp)
        mono = all(ramp[i][0] <= ramp[i + 1][0] + 1e-6 for i in range(4))
        print(f"{slug}: gray spread {spread:.4f}, monotonic {mono}, "
              f"white -> {ramp[-1].round(3)}")
        assert spread < 0.03 and mono
        write_cube(f"{OUT_DIR}/luts/{slug}.cube", out,
                   f"{name} — HNCS via V-Log-Alchemy, re-based to sRGB input")
        recipe = {
            "name": name,
            "baseLut": f"../luts/{slug}.cube",
            "grain": {"amount": 0, "size": "small"},
            "halation": 0,
            "tone": {"highlight": 0, "shadow": 0, "color": 0},
            "whiteBalance": {"tempShift": 0, "tintShift": 0},
            "source": "shenmintao/V-Log-Alchemy — HNCS (Phocus X2D) cube, "
                      "re-based V-Log -> sRGB input by tools/bake_hasselblad.py",
            "license": "Apache-2.0",
            "provenance": {
                "treatment": "Hasselblad Natural Colour Solution rendering "
                             "(Standard/Nature Phocus preset), reverse-"
                             "engineered from Phocus 4.0.1 / X2D output",
                "sourceRepo": "https://github.com/shenmintao/V-Log-Alchemy",
                "note": "Upstream cube expects V-Log/V-Gamut input; this copy "
                        "is composed with the published Panasonic V-Log "
                        "transform so it applies directly to sRGB stills. "
                        "Daylight white balance baked upstream.",
            },
        }
        with open(f"{OUT_DIR}/recipes/{slug}.json", "w") as f:
            json.dump(recipe, f, indent=2)
        print(f"{slug}: written")

if __name__ == "__main__":
    main()
