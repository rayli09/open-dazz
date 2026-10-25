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
src = Image.open(root / "tests/images/rendered/AFXT2720-neutral-1600.png")
src.thumbnail((360, 360))
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
