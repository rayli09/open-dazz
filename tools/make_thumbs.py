#!/usr/bin/env python3
"""Pre-render a preview thumbnail for every catalog look (Sample I scene).

626 CLI invocations take ~35 s. Output: apps/web/public/thumbs/<id with / -> __>.webp
Re-run after importing new looks; existing thumbs are skipped unless --force.
For photo-v1: python3 tools/make_thumbs.py --processing fujiPhotoV1 --force
"""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument("--force", action="store_true")
ap.add_argument("--processing", help="regenerate only recipes with this processing profile")
ap.add_argument("--brand")
ap.add_argument("--tier")
args = ap.parse_args()
cat = json.loads((root / "library/catalog.json").read_text())
# Thumbs preview each look on the default sample (Sample I portrait),
# using a 3:2 face-focused crop so the cards stay comparable.
p = Image.open(root / "apps/web/public/samples/sample-1.jpg")
w, h = p.size
crop = (int(w * 0.08), int(h * 0.02), int(w * 0.98), int(h * 0.02 + (w * 0.90) * 2 / 3))
out = root / "apps/web/public/thumbs"
out.mkdir(parents=True, exist_ok=True)
binp = root / "target/release/opendazz"
looks = [l for d in cat["brands"].values() for tier in d["tiers"].values() for l in tier]
if args.brand:
    looks = [l for l in looks if l["brand"] == args.brand]
if args.tier:
    looks = [l for l in looks if l["tier"] == args.tier]
if args.processing:
    looks = [l for l in looks if json.loads((root / l["recipe"]).read_text()).get("processing") == args.processing]
ids = [l["id"] for l in looks]
temp = tempfile.TemporaryDirectory(prefix="open-dazz-thumbs-")
developed = Path(temp.name) / "developed.png"
done = 0
for lid in ids:
    dest = out / (lid.replace("/", "__") + ".webp")
    if dest.exists() and not args.force:
        done += 1
        continue
    # Develop at the same resolution as the sample preview, then shrink.
    # Developing a 420px crop first made grain disproportionately heavy.
    r = subprocess.run([str(binp), "apply", str(root / "apps/web/public/samples/sample-1.jpg"), str(developed), "--look", lid],
                       capture_output=True, text=True, cwd=root)
    if r.returncode != 0:
        print("FAIL", lid, r.stderr.strip()[:120])
        continue
    thumb = Image.open(developed).convert("RGB").crop(crop)
    thumb.thumbnail((420, 420))
    thumb.save(dest, "WEBP", quality=88)
    done += 1
print(f"thumbs: {done}/{len(ids)}")
temp.cleanup()
if done != len(ids):
    raise SystemExit(1)
