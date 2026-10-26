#!/usr/bin/env python3
"""Bake peva3/EmulsionPresets Lightroom XMPs into open-dazz looks.

Each preset becomes a .cube LUT (the point operations that a LUT can
express) plus a recipe JSON (grain etc. that our engine models natively),
filed under library/<brand>/community/.

CAPTURED (approximations of ACR PV2012 semantics, display-referred):
  Exposure2012 (exact gain), tone regionals Highlights/Shadows/Whites/
  Blacks (luma-masked gains — ACR's are content-adaptive, these are not),
  Contrast2012 (polynomial S-curve), ToneCurvePV2012 master + per-channel
  (PCHIP, exact), Saturation/Vibrance (luma-relative), HSL 8-sector
  adjustments (triangular hue weights), ColorGrade shadow/midtone/
  highlight/global tints (luma masks), GrayMixer for monochrome
  (saturation-weighted sector luminance).
DROPPED (recorded per-preset in provenance): Clarity/Texture/Dehaze and
  vignette/sharpening (spatial), absolute Temperature/Tint (meaningless
  without the source RAW's WB), calibration primaries (rare), ColorGrade
  luminance sliders, GrainFrequency/Roughness (no engine axis).
Utility & Tools presets are skipped: they are editing utilities, not looks.

Usage: python3 tools/bake_emulsion.py /path/to/EmulsionPresets [--size 17]
Run:   uv run --with numpy python tools/bake_emulsion.py <clone>
"""
import argparse, json, re, sys
import xml.etree.ElementTree as ET
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RDF = "{http://www.w3.org/1999/02/22-rdf-syntax-ns#}"
SECTORS = [  # name, center hue (deg) — ACR HSL sectors
    ("Red", 0.0), ("Orange", 30.0), ("Yellow", 60.0), ("Green", 120.0),
    ("Aqua", 180.0), ("Blue", 240.0), ("Purple", 285.0), ("Magenta", 330.0),
]
BRAND_PREFIXES = [
    ("kodak", ["kodak", "kodachrome"]), ("fuji", ["fuji", "fujifilm", "fujicolor"]),
    ("ilford", ["ilford"]), ("agfa", ["agfa"]), ("cinestill", ["cinestill"]),
    ("lomography", ["lomography"]), ("rollei", ["rollei"]), ("foma", ["foma"]),
    ("adox", ["adox"]), ("polaroid", ["polaroid"]), ("harman", ["harman"]),
    ("kentmere", ["kentmere"]), ("bergger", ["bergger"]), ("orwo", ["orwo"]),
    ("ricoh", ["ricoh"]),
]

STOCK_TOKENS = [("kodak", ["portra", "ektar", "tri-x", "tri x"]),
                ("fuji", ["velvia", "provia", "acros"])]

def brand_of(name: str) -> str:
    low = name.lower()
    if low.endswith(" video"):
        low = low[: -len(" video")]
    words = re.split(r"[^a-z]+", low)
    for slug, prefixes in BRAND_PREFIXES:
        if any(low.startswith(p) for p in prefixes) or (words and words[0] in prefixes):
            return slug
    for slug, tokens in STOCK_TOKENS:
        if any(t in low for t in tokens):
            return slug
    return "emulsion"

def parse_xmp(path: Path):
    """Return (attrs dict, curves dict name->[(x,y)...])."""
    tree = ET.parse(path)
    attrs, curves = {}, {}
    for el in tree.iter():
        for k, v in el.attrib.items():
            key = k.split("}")[-1]
            if key not in attrs:
                attrs[key] = v
        tag = el.tag.split("}")[-1]
        if tag.startswith("ToneCurve"):
            pts = []
            for li in el.iter(f"{RDF}li"):
                if li.text and "," in li.text:
                    a, b = li.text.split(",")
                    pts.append((float(a), float(b)))
            if pts:
                curves[tag] = sorted(pts)
    return attrs, curves

def f(attrs, key, default=0.0):
    try:
        return float(attrs.get(key, default))
    except (TypeError, ValueError):
        return default

def pchip_eval(xs, ys, xq):
    """Monotone cubic (Fritsch-Carlson) interpolation, numpy."""
    xs = np.asarray(xs, float); ys = np.asarray(ys, float)
    if len(xs) == 1:
        return np.full_like(xq, ys[0])
    h = np.diff(xs); d = np.diff(ys) / h
    m = np.zeros(len(xs))
    m[1:-1] = np.where(d[:-1] * d[1:] > 0, 2 * h[:-1] * h[1:] / (h[:-1] / d[:-1] + h[1:] / d[1:]) if False else 0, 0)
    # harmonic mean where slopes agree
    for i in range(1, len(xs) - 1):
        if d[i - 1] * d[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    m[0] = d[0]; m[-1] = d[-1]
    idx = np.clip(np.searchsorted(xs, xq) - 1, 0, len(xs) - 2)
    x0, x1 = xs[idx], xs[idx + 1]
    hh = x1 - x0; t = (xq - x0) / hh
    t2, t3 = t * t, t * t * t
    h00, h10, h01, h11 = 2 * t3 - 3 * t2 + 1, t3 - 2 * t2 + t, -2 * t3 + 3 * t2, t3 - t2
    return h00 * ys[idx] + h10 * hh * m[idx] + h01 * ys[idx + 1] + h11 * hh * m[idx + 1]

def rgb_to_hsv(rgb):
    mx = rgb.max(-1); mn = rgb.min(-1); df = mx - mn
    hue = np.zeros_like(mx)
    m = df > 1e-9
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hue = np.where(m & (mx == r), ((g - b) / np.maximum(df, 1e-9)) % 6, hue)
    hue = np.where(m & (mx == g), (b - r) / np.maximum(df, 1e-9) + 2, hue)
    hue = np.where(m & (mx == b), (r - g) / np.maximum(df, 1e-9) + 4, hue)
    hue = hue * 60.0
    sat = np.where(mx > 1e-9, df / np.maximum(mx, 1e-9), 0.0)
    return hue, sat, mx

def hsv_to_rgb(hue, sat, val):
    h = (hue % 360.0) / 60.0
    c = val * sat
    x = c * (1 - np.abs(h % 2 - 1))
    z = np.zeros_like(c)
    conds = [h < 1, h < 2, h < 3, h < 4, h < 5, h >= 5]
    r = np.select(conds, [c, x, z, z, x, c]); g = np.select(conds, [x, c, c, x, z, z])
    b = np.select(conds, [z, z, x, c, c, x])
    m = val - c
    return np.stack([r + m, g + m, b + m], axis=-1)

def sector_weights(hue):
    """Triangular weights over the 8 ACR sectors; returns (...,8)."""
    centers = np.array([c for _, c in SECTORS])
    ext = np.concatenate([centers[-1:] - 360, centers, centers[:1] + 360])
    h = hue[..., None]
    w = np.zeros(hue.shape + (8,))
    for i in range(8):
        c = ext[i + 1]; lo = ext[i]; hi = ext[i + 2]
        wi = np.where(h[..., 0] < c, (h[..., 0] - lo) / max(c - lo, 1e-9), (hi - h[..., 0]) / max(hi - c, 1e-9))
        w[..., i] = np.clip(wi, 0, 1)
    return w

def bake(attrs, curves, size):
    n = size
    axis = np.linspace(0, 1, n)
    grid = np.stack(np.meshgrid(axis, axis, axis, indexing="ij"), -1)  # [b,g,r]
    rgb = grid[..., ::-1].reshape(-1, 3).astype(np.float64)  # rows: r fastest when written
    baked, dropped = [], []
    luma = lambda x: 0.2126 * x[..., 0] + 0.7152 * x[..., 1] + 0.0722 * x[..., 2]

    ev = f(attrs, "Exposure2012")
    if ev:
        rgb = rgb * (2.0 ** ev); baked.append("Exposure2012")
    # tone regionals (luma-masked gains / offsets)
    lum = np.clip(luma(rgb), 0, 1)
    sh, hi, wh, bl = (f(attrs, k) for k in ("Shadows2012", "Highlights2012", "Whites2012", "Blacks2012"))
    if sh or hi or wh or bl:
        gain = np.ones_like(lum)
        gain *= 1 + (sh / 100) * 0.35 * (1 - lum) ** 2
        gain *= 1 + (hi / 100) * 0.30 * lum ** 2
        gain *= 1 + (wh / 100) * 0.20 * np.clip((lum - 0.6) / 0.4, 0, 1)
        rgb = rgb * gain[..., None]
        rgb = rgb + ((bl / 100) * 0.12 * (1 - lum) ** 3)[..., None]
        baked += ["Shadows/Highlights/Whites/Blacks2012 (approx)"]
    con = f(attrs, "Contrast2012")
    if con:
        k = (con / 100) * 0.8
        rgb = rgb + k * rgb * (1 - rgb) * (2 * rgb - 1)
        baked.append("Contrast2012 (approx)")
    # tone curves — exact
    for name, ch in (("ToneCurvePV2012", None), ("ToneCurvePV2012Red", 0), ("ToneCurvePV2012Green", 1), ("ToneCurvePV2012Blue", 2)):
        if name in curves:
            xs = [p[0] / 255 for p in curves[name]]; ys = [p[1] / 255 for p in curves[name]]
            if ch is None:
                for c in range(3):
                    rgb[:, c] = pchip_eval(xs, ys, np.clip(rgb[:, c], 0, 1))
            else:
                rgb[:, ch] = pchip_eval(xs, ys, np.clip(rgb[:, ch], 0, 1))
            baked.append(name)
    mono = attrs.get("ConvertToGrayscale", "").lower() == "true"
    if mono:
        hue, sat, _ = rgb_to_hsv(np.clip(rgb, 0, 1))
        w = sector_weights(hue) * sat[..., None]
        adj = np.array([f(attrs, f"GrayMixer{name}") for name, _ in SECTORS])
        gray = luma(np.clip(rgb, 0, 1)) * (1 + (w * (adj / 100)).sum(-1) / np.maximum(w.sum(-1), 1e-6) * np.clip(w.sum(-1), 0, 1))
        base = luma(np.clip(rgb, 0, 1))
        gray = np.where(w.sum(-1) > 1e-6, gray, base)
        rgb = np.repeat(gray[:, None], 3, axis=1)
        baked.append("GrayMixer (approx)")
    else:
        sat_adj, vib = f(attrs, "Saturation"), f(attrs, "Vibrance")
        if sat_adj or vib:
            lum = luma(rgb)
            psat = (rgb.max(-1) - rgb.min(-1)) / np.maximum(rgb.max(-1), 1e-9)
            k = 1 + sat_adj / 100 + (vib / 100) * (1 - psat) * 0.7
            rgb = lum[..., None] + (rgb - lum[..., None]) * k[..., None]
            baked.append("Saturation/Vibrance (approx)")
        # HSL sector adjustments
        hsl_keys = [(f"HueAdjustment{n}", f"SaturationAdjustment{n}", f"LuminanceAdjustment{n}") for n, _ in SECTORS]
        if any(f(attrs, kk) for grp in hsl_keys for kk in grp):
            hue, sat, val = rgb_to_hsv(np.clip(rgb, 0, 1))
            w = sector_weights(hue)
            dh = (w * np.array([f(attrs, g[0]) for g in hsl_keys]) ).sum(-1) / 100 * 30
            ds = 1 + (w * np.array([f(attrs, g[1]) for g in hsl_keys])).sum(-1) / 100
            dv = (w * np.array([f(attrs, g[2]) for g in hsl_keys])).sum(-1) / 100 * 0.2
            rgb = hsv_to_rgb(hue + dh, np.clip(sat * ds, 0, 1), np.clip(val + dv, 0, 1))
            baked.append("HSL adjustments (approx)")
    # color grading tints
    blend = f(attrs, "ColorGradeBlending", 50)
    balance = f(attrs, "ColorGradeBalance")
    grades = [("Shadow", (1 - np.clip(luma(rgb), 0, 1)) ** 2), ("Midtone", np.exp(-(((np.clip(luma(rgb), 0, 1) - (0.5 + balance / 100 * 0.25)) / 0.3) ** 2))), ("Highlight", np.clip(luma(rgb), 0, 1) ** 2), ("Global", np.ones(len(rgb)))]
    any_grade = False
    for gname, mask in grades:
        gh, gs = f(attrs, f"ColorGrade{gname}Hue"), f(attrs, f"ColorGrade{gname}Sat")
        if gs:
            tint = hsv_to_rgb(np.full(len(rgb), gh), np.full(len(rgb), gs / 100), np.ones(len(rgb)))
            s = (gs / 100) ** 2 * 0.35 * mask * (0.5 + blend / 100)
            rgb = rgb * (1 - s[..., None] * 0.5) + tint * (luma(rgb) * 2)[..., None] * (s[..., None] * 0.5)
            any_grade = True
    if any_grade:
        baked.append("ColorGrade tints (approx)")
    for key, label in (("Clarity2012", "Clarity2012"), ("Texture", "Texture"), ("Dehaze", "Dehaze"),
                       ("PostCropVignetteAmount", "vignette"), ("Sharpness", "sharpening"),
                       ("Temperature", "absolute Temperature/Tint"), ("RedHue", "calibration primaries"),
                       ("ColorGradeShadowLum", "ColorGrade luminance")):
        if f(attrs, key) or (key in attrs and key == "Temperature"):
            dropped.append(label)
    return np.clip(rgb, 0, 1), baked, dropped

def write_cube(path, rgb, size, title):
    lines = [f'TITLE "{title}"', f"LUT_3D_SIZE {size}", "DOMAIN_MIN 0 0 0", "DOMAIN_MAX 1 1 1"]
    for row in rgb:
        lines.append(" ".join(f"{v:.4f}".rstrip("0").rstrip(".") or "0" for v in row))
    path.write_text("\n".join(lines) + "\n")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--size", type=int, default=17)
    args = ap.parse_args()
    src = Path(args.src)
    catalog = json.loads((src / "presets.json").read_text())
    items = catalog if isinstance(catalog, list) else catalog.get("presets", [])
    counts, skipped = {}, []
    for item in items:
        if item["category"] == "Utility & Tools":
            skipped.append(item["name"]); continue
        xmp = src / item["file"]
        attrs, curves = parse_xmp(xmp)
        brand = brand_of(item["name"])
        # Upstream slugs collide for +/- variants ("+1" and "-1" both become
        # "-1" upstream), so derive our filename from the preset name.
        slug = item["name"].lower().replace("+", " plus ").replace("−", " minus ").replace("-", " minus ")
        slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
        rgb, baked, dropped = bake(attrs, curves, args.size)
        bdir = ROOT / "library" / brand / "community"
        (bdir / "luts").mkdir(parents=True, exist_ok=True)
        (bdir / "recipes").mkdir(parents=True, exist_ok=True)
        write_cube(bdir / "luts" / f"{slug}.cube", rgb, args.size, f"{item['name']} (EmulsionPresets bake)")
        ga, gs = f(attrs, "GrainAmount"), f(attrs, "GrainSize")
        recipe = {
            "name": item["name"],
            "baseLut": f"../luts/{slug}.cube",
            "grain": {"amount": round(min(ga / 100 * 0.9, 0.9), 3), "size": "large" if gs >= 50 else "small"},
            "halation": 0,
            "tone": {"highlight": 0, "shadow": 0, "color": 0},
            "whiteBalance": {"tempShift": 0, "tintShift": 0},
            "source": "EmulsionPresets (peva3) — XMP baked to LUT by tools/bake_emulsion.py",
            "license": "MIT",
            "provenance": {
                "category": item["category"], "treatment": item["treatment"],
                "sourceFile": item["file"], "sourceRepo": "https://github.com/peva3/EmulsionPresets",
                "bakedFields": baked, "droppedFields": sorted(set(dropped)),
                "description": item.get("description", "")[:280],
                "notes": "Display-referred PV2012 approximation; see tools/bake_emulsion.py header for what is captured and what is not.",
            },
        }
        (bdir / "recipes" / f"{slug}.json").write_text(json.dumps(recipe, indent=2, ensure_ascii=False) + "\n")
        counts[brand] = counts.get(brand, 0) + 1
    print("baked by brand:", dict(sorted(counts.items())))
    print("total baked:", sum(counts.values()), "| skipped (Utility & Tools):", len(skipped))

if __name__ == "__main__":
    main()
