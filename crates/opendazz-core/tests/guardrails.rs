//! Color guardrails for the official Fujifilm simulations.
//!
//! These tests pin each sim's measured character so a future LUT
//! swap, re-ingest, or pipeline change cannot silently drift the
//! colors (the failure mode that shipped the linear-domain cubes
//! applied raw to JPEGs: the whole family ran ~+0.2 chroma hot,
//! Provia at 1.26, before the Oct 2026 re-base).
//!
//! Probes (all synthetic, generated in code — no binary fixtures):
//!   * hue chart: 12 hues x saturations {0.3, 0.55, 0.8, 1.0} x
//!     values {0.35, 0.55, 0.75, 0.95}; statistic = median CIELAB
//!     chroma gain over patches with input chroma > 15.
//!   * gray ramp: 25 steps, 0.02..0.98; statistics = max neutral
//!     drift (Lab a*/b* magnitude), R-channel slope between steps
//!     3 and 21, luma monotonicity (0.002/step tolerance).
//!   * skin set: 5 representative skin tones; statistics = max
//!     hue-angle shift, median chroma gain.
//!   * black/white points.
//!
//! Bands are the Oct 2026 post-re-base measurements with headroom.
//! Full spec and measured table: docs/COLOR_TEST_CASES.md.
//! If a band fails, the LUT changed character — do not widen a
//! band without re-measuring and documenting why.

use opendazz_core::Lut3d;
use std::path::PathBuf;

fn load(stem: &str) -> Lut3d {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push(format!("../../library/fuji/official/luts/{stem}_sRGB.cube"));
    let text = std::fs::read_to_string(&p)
        .unwrap_or_else(|e| panic!("read {}: {e}", p.display()));
    Lut3d::parse_cube(&text).expect("parse cube")
}

// ---------- color math (sRGB -> XYZ -> CIELAB, D65) ----------

fn srgb_to_linear(c: f32) -> f32 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

fn lab(rgb: [f32; 3]) -> [f32; 3] {
    let (r, g, b) = (srgb_to_linear(rgb[0]), srgb_to_linear(rgb[1]), srgb_to_linear(rgb[2]));
    let x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
    let y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    let f = |t: f32| {
        if t > 0.008856 {
            t.max(0.0).cbrt()
        } else {
            7.787 * t + 16.0 / 116.0
        }
    };
    let (fx, fy, fz) = (f(x), f(y), f(z));
    [116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz)]
}

fn chroma(l: [f32; 3]) -> f32 {
    (l[1] * l[1] + l[2] * l[2]).sqrt()
}

fn median(mut v: Vec<f32>) -> f32 {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    v[v.len() / 2]
}

// ---------- probes ----------

fn hsv_to_rgb(h: f32, s: f32, v: f32) -> [f32; 3] {
    let c = v * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = v - c;
    let (r, g, b) = match (h / 60.0) as u32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    [r + m, g + m, b + m]
}

fn hue_chart() -> Vec<[f32; 3]> {
    let mut out = Vec::new();
    for h in 0..12 {
        for s in [0.3f32, 0.55, 0.8, 1.0] {
            for v in [0.35f32, 0.55, 0.75, 0.95] {
                out.push(hsv_to_rgb(h as f32 * 30.0, s, v));
            }
        }
    }
    out
}

fn median_chroma_gain(lut: &Lut3d) -> f32 {
    let gains: Vec<f32> = hue_chart()
        .iter()
        .filter_map(|p| {
            let cin = chroma(lab(*p));
            if cin > 15.0 {
                let o = lut.sample(p[0], p[1], p[2]);
                Some(chroma(lab(o)) / cin)
            } else {
                None
            }
        })
        .collect();
    median(gains)
}

fn ramp_stats(lut: &Lut3d) -> (f32, f32, bool) {
    let outs: Vec<[f32; 3]> = (0..25)
        .map(|i| {
            let t = 0.02 + i as f32 * (0.96 / 24.0);
            lut.sample(t, t, t)
        })
        .collect();
    let neutral = outs
        .iter()
        .map(|o| chroma(lab(*o)))
        .fold(0.0f32, f32::max);
    let slope = (outs[21][0] - outs[3][0]) / 0.72;
    let mono = outs.windows(2).all(|w| {
        let l0: f32 = w[0].iter().sum::<f32>() / 3.0;
        let l1: f32 = w[1].iter().sum::<f32>() / 3.0;
        l1 >= l0 - 0.002
    });
    (neutral, slope, mono)
}

const SKINS: [[f32; 3]; 5] = [
    [0.78, 0.57, 0.44],
    [0.65, 0.44, 0.33],
    [0.45, 0.30, 0.22],
    [0.88, 0.68, 0.55],
    [0.35, 0.23, 0.17],
];

fn skin_stats(lut: &Lut3d) -> (f32, f32) {
    let mut max_shift = 0.0f32;
    let mut gains = Vec::new();
    for p in SKINS {
        let li = lab(p);
        let o = lut.sample(p[0], p[1], p[2]);
        let lo = lab(o);
        let ai = li[2].atan2(li[1]).to_degrees();
        let ao = lo[2].atan2(lo[1]).to_degrees();
        let shift = ((ao - ai + 180.0) % 360.0 - 180.0).abs();
        max_shift = max_shift.max(shift);
        gains.push(chroma(lo) / chroma(li));
    }
    (max_shift, median(gains))
}

// ---------- character spec ----------

struct Spec {
    stem: &'static str,
    chroma: (f32, f32),
    slope: (f32, f32),
    black_max: (f32, f32),
    skin_hue_max: f32,
    skin_gain: (f32, f32),
}

const SPECS: &[Spec] = &[
    Spec { stem: "astia",         chroma: (0.98, 1.15), slope: (1.09, 1.27), black_max: (0.0, 0.01), skin_hue_max: 10.0, skin_gain: (1.02, 1.26) },
    Spec { stem: "bleach bypass", chroma: (0.36, 0.50), slope: (1.03, 1.20), black_max: (0.10, 0.18), skin_hue_max: 25.0, skin_gain: (0.50, 0.74) },
    Spec { stem: "classic chrome", chroma: (0.79, 0.94), slope: (1.19, 1.38), black_max: (0.0, 0.01), skin_hue_max: 18.0, skin_gain: (0.77, 1.00) },
    Spec { stem: "classic neg",   chroma: (0.58, 0.73), slope: (1.10, 1.28), black_max: (0.07, 0.15), skin_hue_max: 27.0, skin_gain: (0.79, 1.02) },
    Spec { stem: "eterna",        chroma: (0.74, 0.89), slope: (1.02, 1.17), black_max: (0.0, 0.01), skin_hue_max: 13.0, skin_gain: (0.94, 1.19) },
    Spec { stem: "nostalgic neg", chroma: (0.88, 1.03), slope: (1.03, 1.19), black_max: (0.10, 0.17), skin_hue_max: 20.0, skin_gain: (1.42, 1.80) },
    Spec { stem: "pro neg hi",    chroma: (0.92, 1.07), slope: (1.22, 1.40), black_max: (0.0, 0.01), skin_hue_max: 17.0, skin_gain: (0.89, 1.13) },
    Spec { stem: "pro neg std",   chroma: (0.78, 0.92), slope: (1.09, 1.26), black_max: (0.0, 0.01), skin_hue_max: 22.0, skin_gain: (0.83, 1.07) },
    Spec { stem: "provia",        chroma: (0.97, 1.11), slope: (1.10, 1.27), black_max: (0.0, 0.01), skin_hue_max: 15.0, skin_gain: (1.03, 1.28) },
    Spec { stem: "reala ace",     chroma: (0.85, 1.00), slope: (1.14, 1.31), black_max: (0.0, 0.01), skin_hue_max: 14.0, skin_gain: (0.96, 1.20) },
    Spec { stem: "velvia",        chroma: (1.13, 1.30), slope: (1.23, 1.41), black_max: (0.0, 0.01), skin_hue_max: 23.0, skin_gain: (1.34, 1.72) },
];

fn in_band(what: &str, stem: &str, v: f32, band: (f32, f32)) {
    assert!(
        v >= band.0 && v <= band.1,
        "{stem}: {what} = {v:.3} outside band [{:.2}, {:.2}] — the LUT's \
         character changed; re-measure and update docs/COLOR_TEST_CASES.md \
         deliberately, never widen a band just to pass",
        band.0, band.1
    );
}

#[test]
fn chroma_bands() {
    for s in SPECS {
        let lut = load(s.stem);
        in_band("median chroma gain", s.stem, median_chroma_gain(&lut), s.chroma);
    }
}

#[test]
fn neutral_axis_ramp_and_slope() {
    for s in SPECS {
        let lut = load(s.stem);
        let (neutral, slope, mono) = ramp_stats(&lut);
        assert!(
            neutral <= 6.0,
            "{}: gray ramp neutral drift {neutral:.1} Lab units (limit 6.0)",
            s.stem
        );
        assert!(mono, "{}: gray ramp luma is not monotonic", s.stem);
        in_band("ramp slope", s.stem, slope, s.slope);
    }
}

#[test]
fn black_and_white_points() {
    for s in SPECS {
        let lut = load(s.stem);
        let black = lut.sample(0.0, 0.0, 0.0);
        let bmax = black.iter().fold(0.0f32, |a, &b| a.max(b));
        in_band("black point (max channel)", s.stem, bmax, s.black_max);
        let white = lut.sample(1.0, 1.0, 1.0);
        for (i, &w) in white.iter().enumerate() {
            assert!(
                (0.985..=1.0).contains(&w),
                "{}: white point channel {i} = {w:.3} outside [0.985, 1.0]",
                s.stem
            );
        }
    }
}

#[test]
fn skin_tones() {
    for s in SPECS {
        let lut = load(s.stem);
        let (shift, gain) = skin_stats(&lut);
        assert!(
            shift <= s.skin_hue_max,
            "{}: skin hue shift {shift:.1}deg exceeds {:.1}deg",
            s.stem, s.skin_hue_max
        );
        in_band("skin chroma gain", s.stem, gain, s.skin_gain);
    }
}

#[test]
fn family_ordering() {
    let gain = |stem: &str| median_chroma_gain(&load(stem));
    let (velvia, provia, chrome, bleach) = (
        gain("velvia"),
        gain("provia"),
        gain("classic chrome"),
        gain("bleach bypass"),
    );
    assert!(
        velvia > provia && provia > chrome && chrome > bleach,
        "family chroma ordering broken: velvia {velvia:.2} > provia \
         {provia:.2} > chrome {chrome:.2} > bleach {bleach:.2} required"
    );
    let slope = |stem: &str| ramp_stats(&load(stem)).1;
    assert!(
        slope("eterna") < slope("provia"),
        "eterna must stay the flattest sim (slope {} vs provia {})",
        slope("eterna"),
        slope("provia")
    );
}

#[test]
fn sampler_follows_cube_spec_order() {
    // .cube data runs R-fastest: entry (r=1,g=0,b=0) is the second
    // row. A channel-swap cube must swap channels — this pins the
    // axis convention the whole library depends on.
    let text = "LUT_3D_SIZE 2\n\
                0 0 0\n0 0 1\n0 1 0\n0 1 1\n\
                1 0 0\n1 0 1\n1 1 0\n1 1 1\n";
    let lut = Lut3d::parse_cube(text).unwrap();
    assert_eq!(lut.sample(1.0, 0.0, 0.0), [0.0, 0.0, 1.0]);
    assert_eq!(lut.sample(0.0, 0.0, 1.0), [1.0, 0.0, 0.0]);
    assert_eq!(lut.sample(0.0, 1.0, 0.0), [0.0, 1.0, 0.0]);
    let mid = lut.sample(0.5, 0.0, 0.0);
    assert!((mid[2] - 0.5).abs() < 1e-6 && mid[0].abs() < 1e-6);
}
