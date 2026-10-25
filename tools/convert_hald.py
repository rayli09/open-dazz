#!/usr/bin/env python3
"""Convert HaldCLUT PNGs to .cube (resampled), with an identity self-test.

Hald layout (ImageMagick convention): pixels scanned left-to-right,
top-to-bottom; red varies fastest, then green, then blue. A level-L Hald
has L^2 steps per channel and an L^3 x L^3 image. The bundled identity
Hald is converted first: if the ordering assumption were wrong, the
identity check would explode instead of landing at quantization level.

Usage: uv run --with numpy --with pillow python tools/convert_hald.py \
    /tmp/hald-dl [--size 32]
Writes library/fuji/community/hald-bases/luts/*.cube for the 9 B&W bases
the Fuji community recipes need (Acros family, Monochrome family, Sepia).
Source: Stuart Sowerby's Fujifilm X-Trans III set via cedeber/hald-clut
(GPL-3.0 — see the LICENSE/README committed alongside the output).
"""
import argparse
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FILES = {  # source PNG stem -> our cube slug
    "Acros": "acros", "Acros+G": "acros-g", "Acros+R": "acros-r",
    "Acros+Ye": "acros-ye", "Mono": "mono", "Mono+G": "mono-g",
    "Mono+R": "mono-r", "Mono+Ye": "mono-ye", "Sepia": "sepia",
}

def load_hald(path):
    img = np.asarray(Image.open(path).convert("RGB")).astype(np.float64) / 255.0
    side = img.shape[0]
    level = round(side ** (1 / 3))
    assert level ** 3 == side, f"not a Hald square: {path}"
    n = level * level
    px = img.reshape(-1, 3)  # row-major: r fastest, then g, then b
    assert len(px) == n ** 3
    return px.reshape(n, n, n, 3).transpose(2, 1, 0, 3)  # [r][g][b]

def trilinear(lut, size):
    n = lut.shape[0]
    axis = np.linspace(0, n - 1, size)
    out = np.empty((size, size, size, 3))
    x0 = np.floor(axis).astype(int); x1 = np.minimum(x0 + 1, n - 1); fx = axis - x0
    for ri in range(size):
        for gi in range(size):
            # vectorized over b
            c000 = lut[x0[ri], x0[gi]]; c100 = lut[x1[ri], x0[gi]]
            c010 = lut[x0[ri], x1[gi]]; c110 = lut[x1[ri], x1[gi]]
            c001 = lut[x0[ri], x0[gi], x1] if False else None
            # gather b-neighbors properly:
            b0 = np.arange(size)
            def g(i, j, k):
                return lut[i, j, k]
            lo = (g(x0[ri], x0[gi], x0) * (1 - fx[ri]) + g(x1[ri], x0[gi], x0) * fx[ri]) * (1 - fx[gi]) \
               + (g(x0[ri], x1[gi], x0) * (1 - fx[ri]) + g(x1[ri], x1[gi], x0) * fx[ri]) * fx[gi]
            hi = (g(x0[ri], x0[gi], x1) * (1 - fx[ri]) + g(x1[ri], x0[gi], x1) * fx[ri]) * (1 - fx[gi]) \
               + (g(x0[ri], x1[gi], x1) * (1 - fx[ri]) + g(x1[ri], x1[gi], x1) * fx[ri]) * fx[gi]
            out[ri, gi] = lo * (1 - fx[:, None]) + hi * fx[:, None]
    return out

def write_cube(path, lut, title):
    size = lut.shape[0]
    lines = [f'TITLE "{title}"', f"LUT_3D_SIZE {size}", "DOMAIN_MIN 0 0 0", "DOMAIN_MAX 1 1 1"]
    flat = lut.reshape(-1, 3)  # [r][g][b] with r fastest after reshape? ensure order below
    # lut axes are [r][g][b]; .cube wants r fastest within b,g rows:
    flat = lut.transpose(2, 1, 0, 3).reshape(-1, 3)
    for row in flat:
        lines.append(" ".join(f"{v:.4f}".rstrip("0").rstrip(".") or "0" for v in row))
    path.write_text("\n".join(lines) + "\n")

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("src"); ap.add_argument("--size", type=int, default=32)
    args = ap.parse_args(); src = Path(args.src)
    # identity self-test first
    ident = trilinear(load_hald(src / "identity12.png"), args.size)
    axis = np.linspace(0, 1, args.size)
    ref = np.stack(np.meshgrid(axis, axis, axis, indexing="ij"), -1)  # [r][g][b]
    err = np.abs(ident - ref).max() * 255
    print(f"identity self-test: max err {err:.2f}/255")
    assert err < 6, "Hald ordering assumption FAILED"
    outdir = ROOT / "library/fuji/community/hald-bases/luts"
    outdir.mkdir(parents=True, exist_ok=True)
    for stem, slug in FILES.items():
        lut = trilinear(load_hald(src / f"{stem}.png"), args.size)
        write_cube(outdir / f"{slug}.cube", lut, f"Fuji XTrans III {stem} (Sowerby Hald, converted)")
        gray_dev = np.abs(lut[..., 0] - lut[..., 1]).max() * 255
        print(f"  {slug}.cube written (max R-G deviation {gray_dev:.1f}/255)")

if __name__ == "__main__":
    main()
