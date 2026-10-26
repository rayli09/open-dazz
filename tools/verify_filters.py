#!/usr/bin/env python3
"""Filter verification harness (v1).

For each neutral RAW render in tests/images/rendered/ (1600px versions):
  1. Applies every base-sim recipe + selected imported recipes via the
     opendazz CLI (the real engine, not a reimplementation).
  2. Engine fidelity: compares CLI output for the bare sims against an
     independent numpy trilinear reference of the same .cube (mean/p99
     absolute error, in 0..255 units).
  3. Character metrics: mean saturation, luma contrast span, crushed-black
     and clipped-highlight percentages; sky-banding proxy (unique colors in
     a smooth sky crop, after vs before) on the landscape shot.
  4. Directional assertions for sim character + recipe parameter effects.
Outputs: tools/verify-out/metrics.json, contact sheets + a numbers report
under docs/verification/.

Run: uv run --with numpy --with pillow python tools/verify_filters.py
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
CLI = ROOT / "target/release/opendazz"
RENDERED = ROOT / "tests/images/rendered"
OUT = ROOT / "tools/verify-out"
DOCS = ROOT / "docs/verification"
SIM_DIR = ROOT / "library/fuji/official/recipes"
LUT_DIR = ROOT / "library/fuji/official/luts"
RECIPES = [
    "library/fuji/community/recipes/005-docu-classic-chrome-john-peltier.json",
    "library/fuji/community/recipes/017-provia-natural-mark-g-adams.json",
    "library/fuji/community/recipes/021-kodak-vision3-500t-piotr-skrzypek.json",
]

def load_cube(path: Path):
    size, data = None, []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if parts[0] == "LUT_3D_SIZE":
            size = int(parts[1])
        elif parts[0] in ("TITLE", "DOMAIN_MIN", "DOMAIN_MAX"):
            continue
        elif len(parts) == 3:
            try:
                data.append([float(x) for x in parts])
            except ValueError:
                pass
    arr = np.array(data, dtype=np.float32).reshape(size, size, size, 3)  # [b,g,r]
    return size, arr

def ref_apply(img: np.ndarray, size, lut) -> np.ndarray:
    """Independent trilinear reference. img: HxWx3 float 0..1."""
    n = size - 1
    coords = [np.clip(img[..., c], 0, 1) * n for c in (2, 1, 0)]  # b,g,r order for indexing
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

def metrics(img: np.ndarray) -> dict:
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

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)
    sims = sorted(SIM_DIR.glob("*.json"))
    results = {}
    assertions = []

    def check(name, cond, detail):
        assertions.append((name, bool(cond), detail))
        print(f"[{'PASS' if cond else 'FAIL'}] {name}: {detail}")

    for src in sorted(RENDERED.glob("*-neutral-1600.png")):
        tag = src.name.replace("-neutral-1600.png", "")
        img = np.asarray(Image.open(src).convert("RGB"))
        imgf = img.astype(np.float32) / 255.0
        results[tag] = {"neutral": metrics(img), "sims": {}, "recipes": {}}
        tiles = [("NEUTRAL (RAW render)", Image.fromarray(img))]
        print(f"== {tag} ({img.shape[1]}x{img.shape[0]}) ==")

        for sim_recipe in sims:
            recipe = json.loads(sim_recipe.read_text())
            sim_name = recipe["name"].replace("Fujifilm ", "").replace(" (base simulation)", "")
            out_png = OUT / f"{tag}-{sim_recipe.stem}.png"
            subprocess.run([str(CLI), "apply", str(src), str(out_png), "--recipe", str(sim_recipe)],
                           check=True, capture_output=True)
            got = np.asarray(Image.open(out_png).convert("RGB"))
            results[tag]["sims"][sim_name] = metrics(got)
            # engine fidelity vs independent reference
            cube_rel = recipe["baseLut"].replace("../luts/", "")
            size, lut = load_cube(LUT_DIR / cube_rel)
            ref = np.clip(ref_apply(imgf, size, lut) * 255.0, 0, 255)
            diff = np.abs(got.astype(np.float32) - ref)
            results[tag]["sims"][sim_name]["fidelity_mean_abs_err"] = round(float(diff.mean()), 3)
            results[tag]["sims"][sim_name]["fidelity_p99_abs_err"] = round(float(np.percentile(diff, 99)), 2)
            tiles.append((sim_name, Image.fromarray(got)))

        for rel in RECIPES:
            rp = ROOT / rel
            recipe = json.loads(rp.read_text())
            out_png = OUT / f"{tag}-{rp.stem}.png"
            subprocess.run([str(CLI), "apply", str(src), str(out_png), "--recipe", str(rp)],
                           check=True, capture_output=True)
            got = np.asarray(Image.open(out_png).convert("RGB"))
            results[tag]["recipes"][recipe["name"]] = metrics(got)

        # contact sheet
        tw = 500
        th = int(tiles[0][1].height * tw / tiles[0][1].width)
        cols, rows = 3, 4
        sheet = Image.new("RGB", (cols * tw, rows * (th + 22)), "white")
        d = ImageDraw.Draw(sheet)
        for i, (label, tile) in enumerate(tiles[: cols * rows]):
            t = tile.resize((tw, th))
            x, y = (i % cols) * tw, (i // cols) * (th + 22)
            sheet.paste(t, (x, y + 22))
            d.text((x + 6, y + 5), label, fill="black")
        sheet.save(DOCS / f"sheet-{tag}.jpg", quality=88)
        print(f"sheet -> docs/verification/sheet-{tag}.jpg")

        # banding proxy on the landscape sky
        if tag == "DSCF0733":
            sky = img[60:300, 500:1100]
            base_unique = len(np.unique(sky.reshape(-1, 3), axis=0))
            for sim_name, m in results[tag]["sims"].items():
                out_png = OUT / f"{tag}-{sim_name.lower().replace(' ', '-').replace('/', '-')}.png"
            # recompute per-sim sky uniques from saved outputs
            for sim_recipe in sims:
                got = np.asarray(Image.open(OUT / f"{tag}-{sim_recipe.stem}.png").convert("RGB"))
                u = len(np.unique(got[60:300, 500:1100].reshape(-1, 3), axis=0))
                nm = json.loads(sim_recipe.read_text())["name"].replace("Fujifilm ", "").replace(" (base simulation)", "")
                results[tag]["sims"][nm]["sky_unique_ratio"] = round(u / base_unique, 3)
            results[tag]["sky_unique_neutral"] = int(base_unique)

    # ---- character assertions (per image where meaningful) ----
    for tag, r in results.items():
        s = r["sims"]
        check(f"{tag} Velvia more saturated than Provia",
              s["Velvia/Vivid"]["mean_sat"] > s["Provia/Standard"]["mean_sat"],
              f'{s["Velvia/Vivid"]["mean_sat"]} vs {s["Provia/Standard"]["mean_sat"]}')
        check(f"{tag} Provia more saturated than Classic Chrome",
              s["Provia/Standard"]["mean_sat"] > s["Classic Chrome"]["mean_sat"],
              f'{s["Provia/Standard"]["mean_sat"]} vs {s["Classic Chrome"]["mean_sat"]}')
        check(f"{tag} Eterna flatter than Provia",
              s["Eterna/Cinema"]["contrast_span"] < s["Provia/Standard"]["contrast_span"],
              f'{s["Eterna/Cinema"]["contrast_span"]} vs {s["Provia/Standard"]["contrast_span"]}')
        check(f"{tag} Bleach Bypass near-lowest saturation",
              s["Eterna Bleach Bypass"]["mean_sat"] <= sorted(v["mean_sat"] for v in s.values())[1],
              f'{s["Eterna Bleach Bypass"]["mean_sat"]} (min {min(v["mean_sat"] for v in s.values())})')
        fe = max(v["fidelity_mean_abs_err"] for v in s.values())
        check(f"{tag} engine fidelity (all sims, mean abs err vs reference)", fe < 1.0, f"max mean abs err {fe} / 255")
        rec = r["recipes"]
        base = s["Provia/Standard"]
        check(f"{tag} Provia Natural desaturates vs bare Provia (color -4)",
              rec["Provia Natural"]["mean_sat"] < base["mean_sat"],
              f'{rec["Provia Natural"]["mean_sat"]} vs {base["mean_sat"]}')
        check(f"{tag} Vision3 500T saturates vs bare Eterna (color +4)",
              rec["Kodak Vision3 500T"]["mean_sat"] > s["Eterna/Cinema"]["mean_sat"],
              f'{rec["Kodak Vision3 500T"]["mean_sat"]} vs {s["Eterna/Cinema"]["mean_sat"]}')

    (OUT / "metrics.json").write_text(json.dumps({"results": results,
        "assertions": [{"name": n, "pass": p, "detail": d} for n, p, d in assertions]}, indent=2))
    lines = ["# Verification numbers (generated by tools/verify_filters.py)", ""]
    for tag, r in results.items():
        lines.append(f"## {tag}\n")
        lines.append("| look | mean sat | contrast span | crushed % | clipped % | fidelity mean err | sky unique ratio |")
        lines.append("|---|---|---|---|---|---|---|")
        n = r["neutral"]
        lines.append(f"| NEUTRAL | {n['mean_sat']} | {n['contrast_span']} | {n['crushed_pct']} | {n['clipped_pct']} | - | 1.000 |")
        for name, m in r["sims"].items():
            lines.append(f"| {name} | {m['mean_sat']} | {m['contrast_span']} | {m['crushed_pct']} | {m['clipped_pct']} | {m['fidelity_mean_abs_err']} | {m.get('sky_unique_ratio', '-')} |")
        for name, m in r["recipes"].items():
            lines.append(f"| *recipe: {name}* | {m['mean_sat']} | {m['contrast_span']} | {m['crushed_pct']} | {m['clipped_pct']} | - | - |")
        lines.append("")
    lines.append("## Assertions\n")
    for n, p, d in assertions:
        lines.append(f"- [{'PASS' if p else 'FAIL'}] **{n}** — {d}")
    (DOCS / "numbers-2026-10-25.md").write_text("\n".join(lines) + "\n")
    print(f"\n{sum(1 for _, p, _ in assertions if p)}/{len(assertions)} assertions passed")
    return 0 if all(p for _, p, _ in assertions) else 1

if __name__ == "__main__":
    sys.exit(main())
