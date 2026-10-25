#!/usr/bin/env python3
"""Round 4: verify the Hald-derived B&W bases joined to Fuji recipes.
Run: uv run --with numpy --with pillow python tools/verify_round4.py"""
import json, subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
CLI = ROOT / "target/release/openfuji"
OUT = ROOT / "tools/verify-out"; OUT.mkdir(exist_ok=True)

def pick(film):
    for p in sorted((ROOT / "library/fuji/community/recipes").glob("*.json")):
        r = json.loads(p.read_text())
        if r.get("provenance", {}).get("film") == film and r.get("baseLut", "").find("hald-bases") >= 0:
            return f"fuji/community/{p.stem}", r["name"]
    raise SystemExit(f"no joined recipe for {film}")

def metrics(img):
    f = img.astype(np.float32)
    mx, mn = f.max(axis=2), f.min(axis=2)
    return {"channel_spread": round(float((mx - mn).mean()), 2),
            "mean_r_minus_b": round(float(f[..., 0].mean() - f[..., 2].mean()), 2),
            "crushed_pct": round(float((mx <= 4).mean()) * 100, 2)}

def main():
    picks = {film: pick(film) for film in ("ACROS", "MONOCHROME +R", "SEPIA")}
    print("picks:", picks)
    results, ok = {}, True
    for tag in ("AFXT2720", "DSCF0733"):
        src = ROOT / f"tests/images/rendered/{tag}-neutral-1600.png"
        results[tag] = {}; tiles = []
        for film, (rid, name) in picks.items():
            out = OUT / f"r4-{tag}-{film.replace(' ', '_').replace('+', '')}.png"
            subprocess.run([str(CLI), "apply", str(src), str(out), "--look", rid],
                           check=True, capture_output=True, cwd=ROOT)
            got = np.asarray(Image.open(out).convert("RGB"))
            results[tag][film] = metrics(got)
            tiles.append((f"{name} [{film}]", Image.fromarray(got)))
        r = results[tag]
        checks = [
            (f"{tag} ACROS renders monochrome", r["ACROS"]["channel_spread"] < 15, str(r["ACROS"])),
            (f"{tag} MONOCHROME +R renders monochrome", r["MONOCHROME +R"]["channel_spread"] < 15, str(r["MONOCHROME +R"])),
            (f"{tag} SEPIA renders warm-toned gray", r["SEPIA"]["mean_r_minus_b"] > 6 and r["SEPIA"]["channel_spread"] < 60, str(r["SEPIA"])),
        ]
        for nm, passed, detail in checks:
            ok &= passed; print(f"[{'PASS' if passed else 'FAIL'}] {nm}: {detail}")
        tw = 760; th = int(tiles[0][1].height * tw / tiles[0][1].width)
        sheet = Image.new("RGB", (tw, len(tiles) * (th + 20)), "white")
        d = ImageDraw.Draw(sheet)
        for i, (label, tile) in enumerate(tiles):
            sheet.paste(tile.resize((tw, th)), (0, i * (th + 20) + 20))
            d.text((6, i * (th + 20) + 4), f"{tag} - {label}", fill="black")
        sheet.save(ROOT / f"docs/verification/sheet-round4-{tag}.jpg", quality=88)
    (OUT / "round4.json").write_text(json.dumps(results, indent=2))
    print("round 4:", "ALL PASS" if ok else "FAILURES PRESENT")

if __name__ == "__main__":
    main()
