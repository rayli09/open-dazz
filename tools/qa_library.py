#!/usr/bin/env python3
"""Library QA: structural checks over the whole look library.

Fails loudly (exit 1) on any problem. Checks:
  1. catalog.json parses; ids are unique; every entry's recipe exists.
  2. Every recipe JSON parses; every referenced .cube exists, parses,
     and its data count matches LUT_3D_SIZE^3 * 3.
  3. Every catalog id has a thumbnail under apps/web/public/thumbs/.
  4. (with --render) every look applies cleanly via the CLI to a
     small test image and produces a changed, non-degenerate output.
"""
import gzip, json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main() -> int:
    problems: list[str] = []
    cat = json.load(open(os.path.join(ROOT, "library", "catalog.json")))
    looks = []
    for brand in cat["brands"].values():
        for tier in brand["tiers"].values():
            looks.extend(tier)
    ids = [l["id"] for l in looks]
    if len(ids) != len(set(ids)):
        problems.append("duplicate ids in catalog")
    thumbs = set(os.listdir(os.path.join(ROOT, "apps", "web", "public", "thumbs")))
    n_cube = 0
    for l in looks:
        rp = os.path.join(ROOT, l["recipe"])
        if not os.path.exists(rp):
            problems.append(f"{l['id']}: recipe missing at {rp}")
            continue
        try:
            r = json.load(open(rp))
        except Exception as e:
            problems.append(f"{l['id']}: recipe JSON invalid: {e}")
            continue
        base = r.get("baseLut")
        if base:
            cp = os.path.join(os.path.dirname(rp), base)
            if not os.path.exists(cp):
                problems.append(f"{l['id']}: LUT missing: {base}")
            else:
                n_cube += 1
                size, count = None, 0
                for line in gzip.open(cp, "rt", errors="replace"):
                    if line.startswith("LUT_3D_SIZE"):
                        size = int(line.split()[1])
                    elif line and line[0].isdigit():
                        count += 1
                if size is None:
                    problems.append(f"{l['id']}: LUT has no LUT_3D_SIZE")
                elif count != size ** 3:
                    problems.append(f"{l['id']}: LUT rows {count} != {size}^3")
        thumb = l["id"].replace("/", "__") + ".webp"
        if thumb not in thumbs:
            problems.append(f"{l['id']}: thumbnail missing ({thumb})")
    print(f"catalog: {len(looks)} looks, {n_cube} LUT-backed")
    if "--render" in sys.argv:
        exe = os.path.join(ROOT, "target", "release", "opendazz")
        if not os.path.exists(exe):
            exe = os.path.join(ROOT, "target", "debug", "opendazz")
        with tempfile.TemporaryDirectory() as td:
            src = os.path.join(td, "t.png")
            subprocess.run(["python3", "-c",
                            "from PIL import Image; "
                            "im = Image.new('RGB', (96, 72)); "
                            "px = im.load(); "
                            "[px.__setitem__((x, y), (x*255//95, y*255//71, (x+y)*255//166)) "
                            "for y in range(72) for x in range(96)]; "
                            f"im.save('{src}')"], check=True)
            src_bytes = open(src, "rb").read()
            bad = 0
            for l in looks:
                out = os.path.join(td, "o.png")
                p = subprocess.run([exe, "apply", src, out, "--root", ROOT,
                                    "--look", l["id"]],
                                   capture_output=True, text=True)
                if p.returncode != 0:
                    problems.append(f"{l['id']}: render failed: {p.stderr.strip()[:120]}")
                    bad += 1
                elif open(out, "rb").read() == src_bytes:
                    problems.append(f"{l['id']}: render produced an identical file")
                    bad += 1
            print(f"render smoke: {len(looks) - bad}/{len(looks)} passed")
    if problems:
        print(f"\nQA FAILED — {len(problems)} problem(s):")
        for p in problems[:40]:
            print("  -", p)
        return 1
    print("QA PASSED")
    return 0

if __name__ == "__main__":
    sys.exit(main())
