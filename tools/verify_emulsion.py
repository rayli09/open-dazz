#!/usr/bin/env python3
"""EmulsionPresets flagship render checks.
Run: uv run --with numpy --with pillow python tools/verify_emulsion.py"""
import json, subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
CLI = ROOT / "target/release/opendazz"
OUT = ROOT / "tools/verify-out/emulsion"; OUT.mkdir(parents=True, exist_ok=True)
FLAGSHIPS = [  # (fully-qualified id, display) — ids needed: FXW has same-named Fuji looks
    ("kodak/community/kodak-portra-400", "Kodak Portra 400"),
    ("kodak/community/kodak-ektar-100", "Kodak Ektar 100"),
    ("cinestill/community/cinestill-800t", "CineStill 800T"),
    ("ilford/community/ilford-hp5-plus", "Ilford HP5 Plus"),
]

def metrics(img):
    f = img.astype(np.float32)
    mx, mn = f.max(axis=2), f.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    luma = 0.2126 * f[..., 0] + 0.7152 * f[..., 1] + 0.0722 * f[..., 2]
    return {"mean_sat": round(float(sat.mean()), 4),
            "crushed_pct": round(float((mx <= 4).mean()) * 100, 2),
            "clipped_pct": round(float((mx >= 254).mean()) * 100, 2),
            "channel_spread": round(float((mx - mn).mean()), 2)}

def main():
    results, tiles_all = {}, {}
    ok = True
    for tag in ("AFXT2720", "DSCF0733"):
        src = ROOT / f"tests/images/rendered/{tag}-neutral-1600.png"
        neutral = np.asarray(Image.open(src).convert("RGB"))
        results[tag] = {"neutral": metrics(neutral)}
        tiles = [("NEUTRAL", Image.fromarray(neutral))]
        for look_id, look in FLAGSHIPS:
            out = OUT / f"r3-{tag}-{look.replace(' ', '-')}.png"
            subprocess.run([str(CLI), "apply", str(src), str(out), "--look", look_id],
                           check=True, capture_output=True, cwd=ROOT)
            got = np.asarray(Image.open(out).convert("RGB"))
            results[tag][look] = metrics(got)
            tiles.append((look, Image.fromarray(got)))
        tiles_all[tag] = tiles
        r = results[tag]
        checks = [
            (f"{tag} HP5 is monochrome", r["Ilford HP5 Plus"]["channel_spread"] < 3.0,
             f'spread {r["Ilford HP5 Plus"]["channel_spread"]}'),
            (f"{tag} 800T changes the image without clipping blowup",
             r["CineStill 800T"]["clipped_pct"] < r["neutral"]["clipped_pct"] + 5,
             f'clip {r["CineStill 800T"]["clipped_pct"]}% vs neutral {r["neutral"]["clipped_pct"]}%'),
            (f"{tag} Portra 400 stays gentle (crush)",
             r["Kodak Portra 400"]["crushed_pct"] < r["neutral"]["crushed_pct"] + 6,
             f'{r["Kodak Portra 400"]["crushed_pct"]}% vs neutral {r["neutral"]["crushed_pct"]}%'),
        ]
        if tag == "AFXT2720":
            checks.append((f"{tag} Ektar more saturated than Portra",
                           r["Kodak Ektar 100"]["mean_sat"] > r["Kodak Portra 400"]["mean_sat"],
                           f'{r["Kodak Ektar 100"]["mean_sat"]} vs {r["Kodak Portra 400"]["mean_sat"]}'))
        for name, passed, detail in checks:
            ok &= passed
            print(f"[{'PASS' if passed else 'FAIL'}] {name}: {detail}")
    # sheets: one per image, neutral + 4 flagships stacked vertically
    for tag, tiles in tiles_all.items():
        tw = 760; th = int(tiles[0][1].height * tw / tiles[0][1].width)
        sheet = Image.new("RGB", (tw, len(tiles) * (th + 20)), "white")
        d = ImageDraw.Draw(sheet)
        for i, (label, tile) in enumerate(tiles):
            sheet.paste(tile.resize((tw, th)), (0, i * (th + 20) + 20))
            d.text((6, i * (th + 20) + 4), f"{tag} — {label}", fill="black")
        sheet.save(OUT / f"sheet-{tag}.jpg", quality=88)
    (OUT / "results.json").write_text(json.dumps(results, indent=2))
    print("EmulsionPresets flagship render checks:", "ALL PASS" if ok else "FAILURES PRESENT")
    return 0 if ok else 1

if __name__ == "__main__":
    raise SystemExit(main())
