#!/usr/bin/env python3
"""Fresh, paired Fuji still-photo comparisons; no old verify-out data reused.

Requires existing CLI executables, numpy and Pillow. Example:
python3 tools/verify_fuji_photo.py --before /tmp/opendazz-before \
  --baseline-ref 306ee16 --after target/debug/opendazz
No corpus downloads or source mutations. Outputs go to ignored verify-out.
"""
import argparse
import base64
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
LOOKS = {
    "Docu Classic Chrome": "library/fuji/community/recipes/005-docu-classic-chrome-john-peltier.json",
    "Vision3 500T (Fuji recipe)": "library/fuji/community/recipes/021-kodak-vision3-500t-piotr-skrzypek.json",
    "Portra 400 New (Fuji recipe)": "library/fuji/community/recipes/033-kodak-portra-400-new-ritchie-roesch.json",
}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)

def metrics(im):
    a = np.asarray(im.convert("RGB"))
    return {
        "red_ge_254_pct": round(float((a[..., 0] >= 254).mean()) * 100, 4),
        "any_channel_ge_254_pct": round(float((a.max(axis=2) >= 254).mean()) * 100, 4),
        "all_channels_le_4_pct": round(float((a.max(axis=2) <= 4).mean()) * 100, 4),
    }

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--before", type=Path, required=True)
    ap.add_argument("--after", type=Path, required=True)
    ap.add_argument("--baseline-ref", required=True)
    ap.add_argument("--out", type=Path, default=ROOT / "tools/verify-out/fuji-photo-v1")
    ap.add_argument("--check-wasm", action="store_true", help="compare committed browser WASM to native photo pixels (Bun required)")
    args = ap.parse_args()
    before, after, out = args.before.resolve(), args.after.resolve(), args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    baseline = git("rev-parse", args.baseline_ref).decode().strip()
    source_paths = sorted((ROOT / "crates/opendazz-core/src/pipeline").glob("*.rs"))
    source_paths += [ROOT / "crates/opendazz-core/src/recipe.rs", ROOT / "crates/opendazz-wasm/src/lib.rs"]
    manifest = {
        "baseline_commit": baseline,
        "after_parent_commit": git("rev-parse", "HEAD").decode().strip(),
        "engine_source_hashes": {str(p.relative_to(ROOT)): digest(p.read_bytes()) for p in source_paths},
        "binaries": {"before": digest(before.read_bytes()), "after": digest(after.read_bytes())},
        "harness_sha256": digest(Path(__file__).read_bytes()),
        "settings": "native resolution, display-sRGB, recipe strength unchanged, grain/halation as authored",
        "comparisons": [],
    }
    for sample in (1, 2):
        src = ROOT / f"apps/web/public/samples/sample-{sample}.jpg"
        tiles = []
        for i, (name, rel) in enumerate(LOOKS.items()):
            rp = ROOT / rel
            recipe = json.loads(rp.read_text())
            old_bytes = git("show", f"{baseline}:{rel}")
            old_recipe = json.loads(old_bytes)
            assert {k:v for k,v in recipe.items() if k != "processing"} == old_recipe, "baseline recipe changed beyond processing"
            lp = (rp.parent / recipe["baseLut"]).resolve()
            assert git("show", f"{baseline}:{lp.relative_to(ROOT)}") == lp.read_bytes(), "comparison requires identical LUTs"
            entry = {
                "sample": str(src.relative_to(ROOT)), "input_sha256": digest(src.read_bytes()),
                "look": name, "recipe": rel, "recipe_before_sha256": digest(old_bytes),
                "recipe_after_sha256": digest(rp.read_bytes()), "lut_sha256": digest(lp.read_bytes()),
            }
            for version, binary in (("before", before), ("after", after)):
                dest = out / f"sample-{sample}-{i}-{version}.png"
                subprocess.run([str(binary), "apply", str(src), str(dest), "--recipe", str(rp)], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
                im = Image.open(dest).convert("RGB")
                roi = im.crop((420, 370, 820, 790)) if sample == 1 else im
                entry[version] = {"output_sha256": digest(dest.read_bytes()), "whole_image": metrics(im), "face_crop" if sample == 1 else "landscape": metrics(roi)}
                display = im.crop((280, 270, 1000, 1050)) if sample == 1 else im
                tiles.append((i, version, display.copy()))
            manifest["comparisons"].append(entry)
        tw, th = 400, (434 if sample == 1 else 280)
        sheet = Image.new("RGB", (3 * tw, 2 * (th + 28)), "white")
        draw = ImageDraw.Draw(sheet)
        for i, version, im in tiles:
            im.thumbnail((tw, th))
            x, y = i * tw, (0 if version == "before" else 1) * (th + 28)
            sheet.paste(im, (x, y + 28))
            draw.text((x + 5, y + 6), f"{list(LOOKS)[i]} / {version}", fill="black")
        sheet.save(out / f"sample-{sample}-comparison.jpg", quality=94)
    # Separate grain-free measurement isolates the tone/WB acceptance gate.
    face = Image.open(ROOT / "apps/web/public/samples/sample-1.jpg").crop((420, 370, 820, 790))
    face.save(out / "face-input.png")
    manifest["grain_free_face"] = []
    wasm_cases = []
    for name, rel in LOOKS.items():
        rp = ROOT / rel
        r = json.loads(rp.read_text())
        r["baseLut"] = str((rp.parent / r["baseLut"]).resolve())
        r["grain"]["amount"] = 0
        temp_recipe = out / "measurement-recipe.json"
        temp_recipe.write_text(json.dumps(r))
        row = {"look": name}
        for version, binary in (("before",before),("after",after)):
            dest = out / "face-output.png"
            subprocess.run([str(binary),"apply",str(out/"face-input.png"),str(dest),"--recipe",str(temp_recipe)],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
            row[version] = metrics(Image.open(dest))
        manifest["grain_free_face"].append(row)
        # Exercise grain too, and non-opaque alpha, using the exact PNG
        # pixels the native CLI receives (avoid JPEG decoder differences).
        r["grain"]["amount"] = json.loads(rp.read_text())["grain"]["amount"]
        temp_recipe.write_text(json.dumps(r))
        subprocess.run([str(after),"apply",str(out/"face-input.png"),str(out/"face-output.png"),"--recipe",str(temp_recipe)],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
        rgba = np.asarray(face.convert("RGBA")).copy()
        rgba[...,3] = np.arange(rgba.shape[0]*rgba.shape[1],dtype=np.uint32).reshape(rgba.shape[:2]) % 256
        expected = np.asarray(Image.open(out/"face-output.png").convert("RGBA")).copy()
        expected[...,3] = rgba[...,3]
        wasm_cases.append({"name":name,"width":face.width,"height":face.height,"input":base64.b64encode(rgba.tobytes()).decode(),"expected":base64.b64encode(expected.tobytes()).decode(),"recipe":r,"cube":r["baseLut"]})
    if args.check_wasm:
        cases_path = out / "wasm-cases.json"
        cases_path.write_text(json.dumps(wasm_cases))
        result = subprocess.check_output(["bun",str(ROOT/"tools/check_wasm_photo.mjs"),str(cases_path)],cwd=ROOT)
        manifest["wasm_native_parity"] = json.loads(result)
        manifest["browser_wasm_sha256"] = digest((ROOT/"apps/web/src/pkg/opendazz_wasm_bg.wasm").read_bytes())
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest["grain_free_face"], indent=2))
    print(f"Fresh comparisons and hashed manifest: {out}")

if __name__ == "__main__":
    main()
