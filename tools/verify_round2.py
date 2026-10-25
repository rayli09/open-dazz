#!/usr/bin/env python3
"""Verification round 2: input conditioning for the base-sim LUTs.

Round 1 showed the LUTs over-cook contrast on a standard gamma render
(Velvia crushed 32% of pixels on the backlit landscape). Three arms:
  A  neutral gamma render -> LUT            (round 1, reused from metrics.json)
  B  linear render -> LUT -> sRGB encode    (the "linear-contrast input"
                                             hypothesis; numpy reference impl,
                                             CLI fidelity already proven in r1)
  C  neutral render -> LUT, blended 50%     (the pragmatic strength knob)

Success bar (set before running): on DSCF0733, arm B cuts crushed-black %
by >= 40% relative for Provia/Classic Chrome/Velvia without pushing
highlight clipping above 2% or breaking the saturation ordering.

Run: uv run --with rawpy --with numpy --with pillow python tools/verify_round2.py
"""
import json
from pathlib import Path
import numpy as np
import rawpy
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
LUT_DIR = ROOT / "library/fuji/official/luts"
OUT = ROOT / "tools/verify-out"
DOCS = ROOT / "docs/verification"
SIMS = {"Provia/Standard": "provia_sRGB.cube", "Classic Chrome": "classic chrome_sRGB.cube",
        "Velvia/Vivid": "velvia_sRGB.cube"}
TAGS = ["AFXT2720", "DSCF0733"]

def load_cube(path):
    size, data = None, []
    for line in path.read_text().splitlines():
        p = line.split()
        if not p or line.startswith("#"):
            continue
        if p[0] == "LUT_3D_SIZE":
            size = int(p[1])
        elif p[0] in ("TITLE", "DOMAIN_MIN", "DOMAIN_MAX"):
            continue
        elif len(p) == 3:
            try:
                data.append([float(x) for x in p])
            except ValueError:
                pass
    return size, np.array(data, dtype=np.float32).reshape(size, size, size, 3)

def ref_apply(img, size, lut):
    n = size - 1
    coords = [np.clip(img[..., c], 0, 1) * n for c in (2, 1, 0)]
    lo = [np.floor(c).astype(int) for c in coords]
    hi = [np.minimum(l + 1, n) for l in lo]
    fr = [c - l for c, l in zip(coords, lo)]
    fb, fg, fr_ = fr
    out = np.zeros_like(img)
    for c in range(3):
        v000 = lut[lo[0], lo[1], lo[2], c]; v100 = lut[lo[0], lo[1], hi[2], c]
        v010 = lut[lo[0], hi[1], lo[2], c]; v110 = lut[lo[0], hi[1], hi[2], c]
        v001 = lut[hi[0], lo[1], lo[2], c]; v101 = lut[hi[0], lo[1], hi[2], c]
        v011 = lut[hi[0], hi[1], lo[2], c]; v111 = lut[hi[0], hi[1], hi[2], c]
        v00 = v000 * (1 - fr_) + v100 * fr_; v10 = v010 * (1 - fr_) + v110 * fr_
        v01 = v001 * (1 - fr_) + v101 * fr_; v11 = v011 * (1 - fr_) + v111 * fr_
        v0 = v00 * (1 - fg) + v10 * fg; v1 = v01 * (1 - fg) + v11 * fg
        out[..., c] = v0 * (1 - fb) + v1 * fb
    return out

def srgb_encode(lin):
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.clip(lin, 0, None), 1 / 2.4) - 0.055)

def metrics(img):  # uint8 HxWx3
    f = img.astype(np.float32)
    mx, mn = f.max(axis=2), f.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    luma = 0.2126 * f[..., 0] + 0.7152 * f[..., 1] + 0.0722 * f[..., 2]
    return {
        "mean_sat": round(float(sat.mean()), 4),
        "contrast_span": round(float(np.percentile(luma, 99.5) - np.percentile(luma, 0.5)), 1),
        "crushed_pct": round(float((f.max(axis=2) <= 4).mean()) * 100, 2),
        "clipped_pct": round(float((f.max(axis=2) >= 254).mean()) * 100, 2),
    }

def linear_render_1600(raw_name):
    with rawpy.imread(str(ROOT / "tests/images/src" / raw_name)) as raw:
        rgb16 = raw.postprocess(use_camera_wb=True, no_auto_bright=True,
                                output_color=rawpy.ColorSpace.sRGB,
                                output_bps=16, gamma=(1, 1))
    f = rgb16.astype(np.float32) / 65535.0
    k = 4  # block-mean downscale to ~1600px wide
    h, w, _ = f.shape
    f = f[: h // k * k, : w // k * k].reshape(h // k, k, w // k, k, 3).mean(axis=(1, 3))
    return f

def main():
    r1 = json.loads((OUT / "metrics.json").read_text())["results"]
    results = {}
    sheet_tiles = {}
    for tag in TAGS:
        raw_name = f"{tag}.RAF"
        lin = linear_render_1600(raw_name)
        neutral = np.asarray(Image.open(ROOT / f"tests/images/rendered/{tag}-neutral-1600.png").convert("RGB"))
        results[tag] = {}
        for sim, cube in SIMS.items():
            size, lut = load_cube(LUT_DIR / cube)
            stem = {"Provia/Standard": "provia", "Classic Chrome": "classic-chrome", "Velvia/Vivid": "velvia"}[sim]
            # arm B: LUT in linear, then sRGB encode
            b = np.clip(srgb_encode(ref_apply(lin, size, lut)) * 255.0, 0, 255).astype(np.uint8)
            # arm C: 50% blend of round-1 CLI output with neutral
            a_img = np.asarray(Image.open(OUT / f"{tag}-{stem}.png").convert("RGB"))
            c = np.clip(0.5 * a_img.astype(np.float32) + 0.5 * neutral.astype(np.float32), 0, 255).astype(np.uint8)
            results[tag][sim] = {"A": r1[tag]["sims"][sim], "B": metrics(b), "C": metrics(c)}
            if tag == "DSCF0733":
                sheet_tiles[sim] = (a_img, b, c)
            print(f"{tag} {sim}: A crushed {results[tag][sim]['A']['crushed_pct']}% -> "
                  f"B {results[tag][sim]['B']['crushed_pct']}% / C {results[tag][sim]['C']['crushed_pct']}%")
    # assertions vs the pre-set bar (DSCF0733)
    ok = True
    for sim in SIMS:
        a, b = results["DSCF0733"][sim]["A"], results["DSCF0733"][sim]["B"]
        rel = (a["crushed_pct"] - b["crushed_pct"]) / max(a["crushed_pct"], 0.01)
        passed = rel >= 0.40 and b["clipped_pct"] <= 2.0
        ok &= passed
        print(f"[{'PASS' if passed else 'FAIL'}] B cuts {sim} crush by {rel*100:.0f}% (clip {b['clipped_pct']}%)")
    sats_b = [results["DSCF0733"][s]["B"]["mean_sat"] for s in ("Velvia/Vivid", "Provia/Standard", "Classic Chrome")]
    order_ok = sats_b[0] > sats_b[1] > sats_b[2]
    print(f"[{'PASS' if order_ok else 'FAIL'}] B keeps saturation ordering Velvia>Provia>Chrome: {sats_b}")
    # sheet: rows sims, cols arms
    tw, th = 500, 334
    sheet = Image.new("RGB", (3 * tw, 3 * (th + 22)), "white")
    d = ImageDraw.Draw(sheet)
    arms = ("A: gamma render", "B: linear -> LUT -> gamma", "C: 50% blend")
    for r, (sim, (a_img, b_img, c_img)) in enumerate(sheet_tiles.items()):
        for ci, im in enumerate((a_img, b_img, c_img)):
            t = Image.fromarray(im).resize((tw, th))
            x, y = ci * tw, r * (th + 22)
            sheet.paste(t, (x, y + 22))
            d.text((x + 6, y + 5), f"{sim} — {arms[ci]}", fill="black")
    sheet.save(DOCS / "sheet-round2-DSCF0733.jpg", quality=88)
    (OUT / "round2.json").write_text(json.dumps(results, indent=2))
    lines = ["# Round 2 numbers — input conditioning (generated)", "",
             "| image | sim | arm | mean sat | contrast span | crushed % | clipped % |", "|---|---|---|---|---|---|---|"]
    for tag, sims in results.items():
        for sim, arms_d in sims.items():
            for arm, m in arms_d.items():
                lines.append(f"| {tag} | {sim} | {arm} | {m['mean_sat']} | {m['contrast_span']} | {m['crushed_pct']} | {m['clipped_pct']} |")
    (DOCS / "numbers-round2-2026-10-25.md").write_text("\n".join(lines) + "\n")
    print("B-arm bar:", "MET" if ok and order_ok else "NOT MET")

if __name__ == "__main__":
    main()
