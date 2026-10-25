#!/usr/bin/env python3
"""Render RAW test files to neutral sRGB PNGs.

Neutral = as-shot white balance, LibRaw default gamma (2.222/4.5),
no auto-brightness, no highlight recovery tricks. This is the consistent
reference every filter is applied to in the verification runs.

Run: uv run --with rawpy --with pillow python tools/render_test_images.py
"""
import rawpy
from PIL import Image
from pathlib import Path

SRC = Path("tests/images/src")
OUT = Path("tests/images/rendered")
OUT.mkdir(parents=True, exist_ok=True)

for raw_path in sorted(SRC.iterdir()):
    if raw_path.suffix.lower() not in {".raf", ".arw", ".cr2", ".dng", ".nef"}:
        continue
    with rawpy.imread(str(raw_path)) as raw:
        rgb = raw.postprocess(
            use_camera_wb=True,
            no_auto_bright=True,
            output_color=rawpy.ColorSpace.sRGB,
            output_bps=8,
            gamma=(2.222, 4.5),
        )
    img = Image.fromarray(rgb)
    full = OUT / f"{raw_path.stem}-neutral.png"
    img.save(full)
    small = img.copy()
    small.thumbnail((1600, 1600))
    small.save(OUT / f"{raw_path.stem}-neutral-1600.png")
    print(f"{raw_path.name}: {img.size} -> {full.name}; 1600px: {small.size}")
