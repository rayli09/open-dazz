#!/usr/bin/env python3
"""Pre-render a preview thumbnail for every catalog look (Sample I scene).

626 CLI invocations take ~35 s. Output: web/public/thumbs/<id with / -> __>.webp
Re-run after importing new looks; existing thumbs are skipped.
"""
import json
import subprocess
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
cat = json.loads((root / "library/catalog.json").read_text())
# Thumbs preview each look on the default sample (Sample I portrait),
# using a 3:2 face-focused crop so the cards stay comparable.
p = Image.open(root / "web/public/samples/sample-1.jpg")
w, h = p.size
src = p.crop((int(w * 0.08), int(h * 0.02), int(w * 0.98), int(h * 0.02 + (w * 0.90) * 2 / 3)))
src.thumbnail((420, 420))
src.save("/tmp/thumb-src.png")
out = root / "web/public/thumbs"
out.mkdir(parents=True, exist_ok=True)
binp = root / "target/release/openfuji"
ids = [l["id"] for d in cat["brands"].values() for looks in d["tiers"].values() for l in looks]
done = 0
for lid in ids:
    dest = out / (lid.replace("/", "__") + ".webp")
    if dest.exists():
        done += 1
        continue
    r = subprocess.run([str(binp), "apply", "/tmp/thumb-src.png", "/tmp/thumb-out.png", "--look", lid],
                       capture_output=True, text=True, cwd=root)
    if r.returncode != 0:
        print("FAIL", lid, r.stderr.strip()[:120])
        continue
    Image.open("/tmp/thumb-out.png").convert("RGB").save(dest, "WEBP", quality=68)
    done += 1
print(f"thumbs: {done}/{len(ids)}")
