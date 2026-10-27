fn read_gzip(path: &std::path::Path) -> std::io::Result<String> {
    use std::io::Read;
    let mut text = String::new();
    flate2::read::GzDecoder::new(std::fs::File::open(path)?).read_to_string(&mut text)?;
    Ok(text)
}

use opendazz_core::Lut3d;
use palette::{color_difference::Ciede2000, Lab};
use std::path::PathBuf;

fn load(stem: &str) -> Lut3d {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push(format!("../../library/fuji/official/luts/{stem}_sRGB.cube.gz"));
    let text = read_gzip(&p)
        .unwrap_or_else(|e| panic!("read {}: {e}", p.display()));
    Lut3d::parse_cube(&text).expect("parse cube")
}

// sRGB -> CIELAB (D65), same converter as guardrails.rs.
fn srgb_to_linear(c: f32) -> f32 {
    if c <= 0.04045 { c / 12.92 } else { ((c + 0.055) / 1.055).powf(2.4) }
}
fn lab(rgb: [f32; 3]) -> Lab {
    let (r, g, b) = (srgb_to_linear(rgb[0]), srgb_to_linear(rgb[1]), srgb_to_linear(rgb[2]));
    let x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
    let y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    let f = |t: f32| if t > 0.008856 { t.max(0.0).cbrt() } else { 7.787 * t + 16.0 / 116.0 };
    let (fx, fy, fz) = (f(x), f(y), f(z));
    Lab::new(116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz))
}

fn delta_e(a: [f32; 3], b: [f32; 3]) -> f32 {
    lab(a).difference(lab(b))
}

// Probe set: identical generators to guardrails.rs (hue chart +
// gray ramp + skin set) = 222 patches per sim.
fn hsv_to_rgb(h: f32, s: f32, v: f32) -> [f32; 3] {
    let c = v * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = v - c;
    let (r, g, b) = match (h / 60.0) as u32 {
        0 => (c, x, 0.0), 1 => (x, c, 0.0), 2 => (0.0, c, x),
        3 => (0.0, x, c), 4 => (x, 0.0, c), _ => (c, 0.0, x),
    };
    [r + m, g + m, b + m]
}
fn probes() -> Vec<[f32; 3]> {
    let mut out = Vec::new();
    for h in 0..12 {
        for s in [0.3f32, 0.55, 0.8, 1.0] {
            for v in [0.35f32, 0.55, 0.75, 0.95] {
                out.push(hsv_to_rgb(h as f32 * 30.0, s, v));
            }
        }
    }
    for i in 0..25 {
        let t = 0.02 + i as f32 * (0.96 / 24.0);
        out.push([t, t, t]);
    }
    out.extend([
        [0.78, 0.57, 0.44], [0.65, 0.44, 0.33], [0.45, 0.30, 0.22],
        [0.88, 0.68, 0.55], [0.35, 0.23, 0.17],
    ]);
    out
}

const STEMS: &[&str] = &[
    "astia", "bleach bypass", "classic chrome", "classic neg", "eterna",
    "nostalgic neg", "pro neg hi", "pro neg std", "provia", "reala ace",
    "velvia",
];

fn golden_path() -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("tests/fixtures/golden_official.csv");
    p
}

/// Re-bless the golden outputs from the current cubes. Run
/// deliberately after an intentional LUT change:
///   cargo test -p opendazz-core --test guardrails_deltae -- --ignored
/// A re-bless must ride in the same commit as the LUT change and
/// the docs/COLOR_TEST_CASES.md band review.
#[test]
#[ignore]
fn bless_goldens() {
    let mut s = String::from("sim,patch,r,g,b\n");
    for stem in STEMS {
        let lut = load(stem);
        for (i, p) in probes().iter().enumerate() {
            let o = lut.sample(p[0], p[1], p[2]);
            s.push_str(&format!("{stem},{i},{:.6},{:.6},{:.6}\n", o[0], o[1], o[2]));
        }
    }
    std::fs::write(golden_path(), s).expect("write goldens");
}

#[test]
fn golden_regression_delta_e() {
    let text = std::fs::read_to_string(golden_path()).expect(
        "golden fixture missing — bless it: cargo test -p opendazz-core \
         --test guardrails_deltae bless_goldens -- --ignored",
    );
    let probes = probes();
    // Parse each cube ONCE — re-parsing per fixture row made this
    // test take 248s instead of seconds.
    let luts: std::collections::HashMap<&str, Lut3d> =
        STEMS.iter().map(|s| (*s, load(s))).collect();
    let mut sums: std::collections::HashMap<&str, (f32, f32, usize)> = Default::default();
    let mut seen = std::collections::HashSet::new();
    for line in text.lines().skip(1) {
        let f: Vec<&str> = line.split(',').collect();
        let (stem, idx) = (f[0], f[1].parse::<usize>().unwrap());
        assert!(STEMS.contains(&stem), "unknown sim in golden fixture: {stem}");
        assert!(idx < probes.len(), "invalid patch index {idx} for {stem}");
        assert!(seen.insert((stem, idx)), "duplicate golden patch: {stem}/{idx}");
        let golden = [
            f[2].parse::<f32>().unwrap(),
            f[3].parse::<f32>().unwrap(),
            f[4].parse::<f32>().unwrap(),
        ];
        let lut = &luts[stem];
        let p = probes[idx];
        let now = lut.sample(p[0], p[1], p[2]);
        let d = delta_e(now, golden);
        let e = sums.entry(STEMS.iter().find(|s| **s == stem).unwrap()).or_default();
        e.0 += d;
        e.1 = e.1.max(d);
        e.2 += 1;
    }
    assert_eq!(sums.len(), STEMS.len(), "goldens must cover every official sim");
    for stem in STEMS {
        for idx in 0..probes.len() {
            assert!(seen.contains(&(*stem, idx)), "missing golden patch: {stem}/{idx}");
        }
    }
    for (stem, (sum, max, n)) in &sums {
        let mean = sum / *n as f32;
        assert!(
            mean <= 1.0 && *max <= 2.0,
            "{stem}: golden regression mean ΔE00 {mean:.3} (limit 1.0), \
             max {max:.3} (limit 2.0) — the shipped LUT outputs moved; \
             if this change is intentional, re-bless and re-check the \
             character bands in guardrails.rs"
        );
    }
}

// The 34 CIEDE2000 reference pairs of Sharma, Wu & Dalal (2005),
// as transcribed in the colour-science test fixtures (BSD-3) and
// verified against colour 0.4.7 to <1e-4. They conformance-test
// the palette ΔE00 implementation the golden regression relies on.
const SHARMA: &[([f32; 3], [f32; 3], f32)] = &[
([50.0, 2.6772, -79.7751],[50.0, 0.0, -82.7485],2.0425),
    ([50.0, 3.1571, -77.2803],[50.0, 0.0, -82.7485],2.8615),
    ([50.0, 2.8361, -74.02],[50.0, 0.0, -82.7485],3.4412),
    ([50.0, -1.3802, -84.2814],[50.0, 0.0, -82.7485],1.0),
    ([50.0, -1.1848, -84.8006],[50.0, 0.0, -82.7485],1.0),
    ([50.0, -0.9009, -85.5211],[50.0, 0.0, -82.7485],1.0),
    ([50.0, 0.0, 0.0],[50.0, -1.0, 2.0],2.3669),
    ([50.0, -1.0, 2.0],[50.0, 0.0, 0.0],2.3669),
    ([50.0, 2.49, -0.001],[50.0, -2.49, 0.0009],7.1792),
    ([50.0, 2.49, -0.001],[50.0, -2.49, 0.001],7.1792),
    ([50.0, 2.49, -0.001],[50.0, -2.49, 0.0011],7.2195),
    ([50.0, 2.49, -0.001],[50.0, -2.49, 0.0012],7.2195),
    ([50.0, -0.001, 2.49],[50.0, 0.0009, -2.49],4.8045),
    ([50.0, -0.001, 2.49],[50.0, 0.001, -2.49],4.8045),
    ([50.0, -0.001, 2.49],[50.0, 0.0011, -2.49],4.7461),
    ([50.0, 2.5, 0.0],[50.0, 0.0, -2.5],4.3065),
    ([50.0, 2.5, 0.0],[73.0, 25.0, -18.0],27.1492),
    ([50.0, 2.5, 0.0],[61.0, -5.0, 29.0],22.8977),
    ([50.0, 2.5, 0.0],[56.0, -27.0, -3.0],31.903),
    ([50.0, 2.5, 0.0],[58.0, 24.0, 15.0],19.4535),
    ([50.0, 2.5, 0.0],[50.0, 3.1736, 0.5854],1.0),
    ([50.0, 2.5, 0.0],[50.0, 3.2972, 0.0],1.0),
    ([50.0, 2.5, 0.0],[50.0, 1.8634, 0.5757],1.0),
    ([50.0, 2.5, 0.0],[50.0, 3.2592, 0.335],1.0),
    ([60.2574, -34.0099, 36.2677],[60.4626, -34.1751, 39.4387],1.2644),
    ([63.0109, -31.0961, -5.8663],[62.8187, -29.7946, -4.0864],1.263),
    ([61.2901, 3.7196, -5.3901],[61.4292, 2.248, -4.962],1.8731),
    ([35.0831, -44.1164, 3.7933],[35.0232, -40.0716, 1.5901],1.8645),
    ([22.7233, 20.0904, -46.694],[23.0331, 14.973, -42.5619],2.0373),
    ([36.4612, 47.858, 18.3852],[36.2715, 50.5065, 21.2231],1.4146),
    ([90.8027, -2.0831, 1.441],[91.1528, -1.6435, 0.0447],1.4441),
    ([90.9257, -0.5406, -0.9208],[88.6381, -0.8985, -0.7239],1.5381),
    ([6.7747, -0.2908, -2.4247],[5.8714, -0.0985, -2.2286],0.6377),
    ([2.0776, 0.0795, -1.135],[0.9033, -0.0636, -0.5514],0.9082)];

#[test]
fn delta_e00_matches_sharma_reference_pairs() {
    for (i, (a, b, expected)) in SHARMA.iter().enumerate() {
        let l1: Lab = Lab::new(a[0], a[1], a[2]);
        let l2: Lab = Lab::new(b[0], b[1], b[2]);
        let got = l1.difference(l2);
        assert!(
            (got - expected).abs() <= 0.02,
            "Sharma pair {}: palette ΔE00 {got:.4} vs published {expected}",
            i + 1
        );
    }
}
