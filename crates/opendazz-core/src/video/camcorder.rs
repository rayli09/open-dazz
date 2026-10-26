//! Sony HDR-CX405-class consumer camcorder simulation — a Rust
//! port of Ray's camcorder-pipeline v1.2 (`src/camcorder.py`),
//! stage for stage, in the camera's own order: optics → sensor →
//! ISP → codec scars. See that repo's LOOK_BIBLE.md for the 12
//! signatures this implements.
//!
//! The pipeline is *stateful*: temporal smear needs the previous
//! frame and the AE/WB/handheld drift signals evolve per frame.
//! Stills call [`Camcorder::process_still`] (frame 0, no smear).
//!
//! Two deliberate deviations from the Python reference, both with
//! the Swift port's precedent: the drift signals and sensor noise
//! use a SplitMix64 stream instead of NumPy's PCG64 — statistically
//! identical (same frequencies, amplitudes, distributions), not
//! sample-identical, because drift and noise are random processes
//! in the real camera too. Everything deterministic — bottleneck
//! ratios, color matrix, tone LUTs, lens maps — is transcribed
//! exactly, and the end-to-end test pins the port against the
//! Python pipeline's own output with drift/noise neutralized
//! (tests/fixtures/cx405_*).

use crate::image::{
    gaussian_blur, resize_area, resize_bilinear, sample_bilinear_reflect, warp_affine,
};

/// Reference working width of the Python pipeline; every
/// pixel-space constant below is authored at 960 px wide and
/// scaled by `work_w / REF_W`.
const REF_W: f32 = 960.0;

/// SplitMix64 — the drift/noise stream (Swift port precedent).
struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    fn new(seed: u64) -> Self {
        Self { state: seed }
    }
    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    /// Uniform in 0..1.
    fn uniform(&mut self) -> f32 {
        (self.next_u64() >> 40) as f32 / (1u64 << 24) as f32
    }
    /// Standard normal via Box–Muller (pairs; second value cached).
    fn normal(&mut self, spare: &mut Option<f32>) -> f32 {
        if let Some(v) = spare.take() {
            return v;
        }
        let u1 = self.uniform().max(1e-12);
        let u2 = self.uniform();
        let r = (-2.0 * u1.ln()).sqrt();
        let t = 2.0 * std::f32::consts::PI * u2;
        *spare = Some(r * t.sin());
        r * t.cos()
    }
}

#[derive(Clone, Copy)]
struct Wave {
    freq: f32,
    phase: f32,
    amp: f32,
}

/// Sum-of-sines smooth signal (Python `smooth_signal`): three
/// seeded waves, normalized by their theoretical max amplitude.
struct SmoothSignal {
    waves: Vec<Wave>,
    amp: f32,
}

impl SmoothSignal {
    fn new(rng: &mut SplitMix64, freqs: &[f32], amp: f32) -> Self {
        let waves = freqs
            .iter()
            .map(|&f| Wave {
                freq: f,
                phase: rng.uniform() * 6.28,
                amp: 0.4 + 0.6 * rng.uniform(),
            })
            .collect();
        Self { waves, amp }
    }
    fn at(&self, frame: u32) -> f32 {
        let t = frame as f32 / 30.0;
        let (mut s, mut norm) = (0.0f32, 0.0f32);
        for w in &self.waves {
            s += (2.0 * std::f32::consts::PI * w.freq * t + w.phase).sin() * w.amp;
            norm += w.amp;
        }
        if norm > 0.0 {
            s / norm * self.amp
        } else {
            0.0
        }
    }
}

/// Per-frame camera behavior: AE/WB hunting + handheld jitter.
struct Drift {
    expo: SmoothSignal,
    warm: SmoothSignal,
    jx: SmoothSignal,
    jy: SmoothSignal,
    jr: SmoothSignal,
}

impl Drift {
    fn new(seed: u64) -> Self {
        let mut rng = SplitMix64::new(seed);
        // Draw order mirrors the Python Drift.__init__ sequence.
        let expo = SmoothSignal::new(&mut rng, &[0.11, 0.043, 0.017], 0.045);
        let warm = SmoothSignal::new(&mut rng, &[0.11, 0.043, 0.017], 0.035);
        let jx = SmoothSignal::new(&mut rng, &[0.5, 0.23, 0.9], 1.6);
        let jy = SmoothSignal::new(&mut rng, &[0.47, 0.31, 0.83], 1.2);
        let jr = SmoothSignal::new(&mut rng, &[0.05, 0.021], 0.06);
        Self {
            expo,
            warm,
            jx,
            jy,
            jr,
        }
    }
    /// (exposure gain, WB warmth, jitter x px, jitter y px, rotation deg)
    fn at(&self, frame: u32) -> (f32, f32, f32, f32, f32) {
        (
            1.0 + self.expo.at(frame),
            self.warm.at(frame),
            self.jx.at(frame),
            self.jy.at(frame),
            self.jr.at(frame),
        )
    }
}

/// Global tone LUT, Python `build_tone_lut`: lifted milky toe,
/// mild gamma, hard shoulder that slams highlights into the clip.
fn build_tone_lut(black_lift: f32, gamma: f32) -> [f32; 1024] {
    let clip_hi = 0.985f32;
    let knee = 0.86f32;
    let mut lut = [0.0f32; 1024];
    for (i, v) in lut.iter_mut().enumerate() {
        let x = i as f32 / 1023.0;
        let mut y = x.powf(gamma);
        y = y * 1.10 - 0.045 * (-x * 9.0).exp();
        y = black_lift + y * (1.0 - black_lift);
        y = y.clamp(0.0, clip_hi);
        if y > knee {
            y = knee + (y - knee) * 0.35;
        }
        *v = y;
    }
    lut
}

fn apply_lut(v: f32, lut: &[f32; 1024]) -> f32 {
    let x = v.clamp(0.0, 1.0) * 1023.0;
    let i = x.floor() as usize;
    let f = x - i as f32;
    if i >= 1023 {
        lut[1023]
    } else {
        lut[i] * (1.0 - f) + lut[i + 1] * f
    }
}

/// The CX405 processor. One instance per clip/stream.
pub struct Camcorder {
    drift: Drift,
    noise_rng: SplitMix64,
    noise_spare: Option<f32>,
    prev: Option<Vec<f32>>,
    lut_day: [f32; 1024],
    lut_night: [f32; 1024],
    /// Test/verification hooks: freeze the drift at neutral and
    /// scale the sensor noise (1.0 = the calibrated look).
    pub drift_enabled: bool,
    pub noise_scale: f32,
}

impl Default for Camcorder {
    fn default() -> Self {
        Self::new(7)
    }
}

impl Camcorder {
    pub fn new(seed: u64) -> Self {
        Self {
            drift: Drift::new(seed),
            noise_rng: SplitMix64::new(seed.wrapping_add(1)),
            noise_spare: None,
            prev: None,
            lut_day: build_tone_lut(0.012, 1.06),
            lut_night: build_tone_lut(0.050, 1.12),
            drift_enabled: true,
            noise_scale: 1.0,
        }
    }

    /// Process one still: frame 0, no temporal smear.
    pub fn process_still(rgb: &[u8], w: usize, h: usize) -> Vec<u8> {
        Self::new(7).process_frame(rgb, w, h, 0)
    }

    /// Process one RGB frame (u8, interleaved). The frame is
    /// reduced to the ≤960-px working width, run through the
    /// pipeline, and upscaled back to the input size — the same
    /// working/delivery split as the Python pipeline.
    pub fn process_frame(&mut self, rgb: &[u8], w: usize, h: usize, frame: u32) -> Vec<u8> {
        assert_eq!(rgb.len(), w * h * 3, "rgb buffer size mismatch");
        let s = if w > 960 {
            REF_W / w as f32
        } else {
            1.0
        };
        let ww = ((w as f32 * s).round() as usize).max(2);
        let wh = ((h as f32 * s).round() as usize).max(2);

        // Split to planes, reduce to working size.
        let mut planes: Vec<Vec<f32>> = (0..3)
            .map(|c| {
                let mut p = vec![0.0f32; w * h];
                for (i, px) in p.iter_mut().enumerate() {
                    *px = rgb[i * 3 + c] as f32 / 255.0;
                }
                if ww != w || wh != h {
                    resize_area(&p, w, h, ww, wh)
                } else {
                    p
                }
            })
            .collect();
        let ws = ww as f32 / REF_W; // pixel-space scale at work res

        let out = self.process_work(&mut planes, ww, wh, ws, frame);

        // Back to input size, interleaved u8.
        let mut bytes = vec![0u8; w * h * 3];
        for c in 0..3 {
            let up = if ww != w || wh != h {
                resize_bilinear(&out[c], ww, wh, w, h)
            } else {
                out[c].clone()
            };
            for (i, v) in up.iter().enumerate() {
                bytes[i * 3 + c] = (v.clamp(0.0, 1.0) * 255.0) as u8;
            }
        }
        bytes
    }

    /// The 10 stages at working resolution. `planes` are R, G, B.
    fn process_work(
        &mut self,
        planes: &mut [Vec<f32>],
        w: usize,
        h: usize,
        ws: f32,
        frame: u32,
    ) -> [Vec<f32>; 3] {
        let n = w * h;
        let (expo, warm, jx, jy, jr) = if self.drift_enabled {
            let d = self.drift.at(frame);
            (d.0, d.1, d.2 * ws, d.3 * ws, d.4)
        } else {
            (1.0, 0.0, 0.0, 0.0, 0.0)
        };

        // --- 1. handheld micro-jitter ---
        if jx != 0.0 || jy != 0.0 || jr != 0.0 {
            let (cx, cy) = (w as f32 / 2.0, h as f32 / 2.0);
            let rad = jr.to_radians();
            let (a, b) = (rad.cos(), rad.sin());
            let mut m = [
                a,
                b,
                (1.0 - a) * cx - b * cy,
                -b,
                a,
                b * cx + (1.0 - a) * cy,
            ];
            m[2] += jx;
            m[5] += jy;
            for p in planes.iter_mut() {
                *p = warp_affine(p, w, h, m);
            }
        }

        // --- scene darkness ("Intelligent Auto") ---
        let mean_luma: f32 = (0..n)
            .map(|i| 0.299 * planes[0][i] + 0.587 * planes[1][i] + 0.114 * planes[2][i])
            .sum::<f32>()
            / n as f32;
        let dark = ((0.42 - mean_luma) / 0.42).clamp(0.0, 1.0);

        // --- 2. resolution destruction: luma/chroma bottlenecks ---
        let mut y_plane = vec![0.0f32; n];
        let mut cr_plane = vec![0.0f32; n];
        let mut cb_plane = vec![0.0f32; n];
        for i in 0..n {
            let (r, g, b) = (planes[0][i], planes[1][i], planes[2][i]);
            let y = 0.299 * r + 0.587 * g + 0.114 * b;
            y_plane[i] = y;
            cr_plane[i] = (r - y) * 0.713 + 0.5;
            cb_plane[i] = (b - y) * 0.564 + 0.5;
        }
        let (yw, yh) = (
            ((w as f32 * 0.88) as usize).max(1),
            ((h as f32 * 0.88) as usize).max(1),
        );
        y_plane = resize_bilinear(&resize_area(&y_plane, w, h, yw, yh), yw, yh, w, h);
        y_plane = gaussian_blur(&y_plane, w, h, 0.3 * ws, 0.3 * ws);
        let chroma_kill = |c: Vec<f32>| -> Vec<f32> {
            let (cw, ch) = (
                ((w as f32 * 0.30) as usize).max(1),
                ((h as f32 * 0.38) as usize).max(1),
            );
            let small = resize_area(&c, w, h, cw, ch);
            let up = resize_bilinear(&small, cw, ch, w, h);
            let blurred = gaussian_blur(&up, w, h, 1.9 * ws, 0.6 * ws);
            // Chroma sits offset from luma (+3px, +1px at 960 wide).
            warp_affine(
                &blurred,
                w,
                h,
                [1.0, 0.0, 3.0 * ws, 0.0, 1.0, 1.0 * ws],
            )
        };
        cr_plane = chroma_kill(cr_plane);
        cb_plane = chroma_kill(cb_plane);
        for i in 0..n {
            let (y, cr, cb) = (y_plane[i], cr_plane[i] - 0.5, cb_plane[i] - 0.5);
            planes[0][i] = y + 1.403 * cr;
            planes[1][i] = y - 0.714 * cr - 0.344 * cb;
            planes[2][i] = y + 1.773 * cb;
        }

        // --- 3. temporal smear (in-camera NR + slow shutter) ---
        if let Some(prev) = &self.prev {
            if prev.len() == n * 3 {
                for i in 0..n {
                    let y_now =
                        0.299 * planes[0][i] + 0.587 * planes[1][i] + 0.114 * planes[2][i];
                    let keep = (0.10 + 0.55 * dark) * (1.0 - 0.55 * y_now);
                    for c in 0..3 {
                        planes[c][i] =
                            planes[c][i] * (1.0 - keep) + prev[i * 3 + c] * keep;
                    }
                }
            }
        }

        // --- 4. global contrast only (undo phone "clarity") ---
        for c in 0..3 {
            let blur = gaussian_blur(&planes[c], w, h, 18.0 * ws, 18.0 * ws);
            for i in 0..n {
                planes[c][i] = blur[i] + (planes[c][i] - blur[i]) * 0.96;
            }
        }

        // --- 5. AE / WB hunting ---
        for i in 0..n {
            planes[0][i] *= expo * (1.0 + warm);
            planes[1][i] *= expo;
            planes[2][i] *= expo * (1.0 - warm * 0.8);
        }

        // --- 6. Sony consumer color ---
        for i in 0..n {
            let (r, g, b) = (planes[0][i], planes[1][i], planes[2][i]);
            // The Python matrix is authored in BGR order; this is
            // its exact RGB transcription.
            let mut nr = (-0.02 * b + 0.12 * g + 0.96 * r).clamp(0.0, 1.2);
            let mut ng = (0.04 * b + 1.02 * g + 0.02 * r).clamp(0.0, 1.2);
            let mut nb = (0.94 * b + 0.10 * g - 0.03 * r).clamp(0.0, 1.2);
            let gray = (nr + ng + nb) / 3.0;
            let chroma_amt = nr.max(ng).max(nb) - nr.min(ng).min(nb);
            let sat = (0.88 + 0.08 * dark) * (1.0 + 0.85 * (chroma_amt - 0.18).max(0.0));
            nr = gray + (nr - gray) * sat;
            ng = gray + (ng - gray) * sat;
            nb = gray + (nb - gray) * sat;
            let green_excess = (ng - nr.max(nb)).max(0.0);
            ng += green_excess * 0.08;
            nr += green_excess * 0.025;
            // ~6-bit color depth -> banding (soft posterize blend).
            planes[0][i] = nr * 0.35 + (nr * 60.0).round() / 60.0 * 0.65;
            planes[1][i] = ng * 0.35 + (ng * 60.0).round() / 60.0 * 0.65;
            planes[2][i] = nb * 0.35 + (nb * 60.0).round() / 60.0 * 0.65;
        }

        // --- 7. tone curve (day/night blend by darkness) ---
        let mut lut = [0.0f32; 1024];
        for i in 0..1024 {
            lut[i] = self.lut_day[i] * (1.0 - dark) + self.lut_night[i] * dark;
        }
        for c in 0..3 {
            for i in 0..n {
                planes[c][i] = apply_lut(planes[c][i], &lut);
            }
        }

        // --- 8. highlight blooming ---
        let bloom_gain = 0.07 + 0.60 * dark;
        if bloom_gain > 0.0 {
            let sigma = (7.0 + 18.0 * dark) * ws;
            for c in 0..3 {
                let hi: Vec<f32> = planes[c]
                    .iter()
                    .map(|&v| (v - 0.86).max(0.0) * 3.2)
                    .collect();
                let bloom = gaussian_blur(&hi, w, h, sigma, sigma);
                for i in 0..n {
                    planes[c][i] = (planes[c][i] + bloom[i] * bloom_gain).clamp(0.0, 1.0);
                }
            }
        }

        // --- 9. lens: CA, corner softness, vignette ---
        let (cx, cy) = (w as f32 / 2.0, h as f32 / 2.0);
        let mut vig = vec![0.0f32; n];
        let mut corner = vec![0.0f32; n];
        for yy in 0..h {
            for xx in 0..w {
                let nx = (xx as f32 - cx) / cx;
                let ny = (yy as f32 - cy) / cy;
                let r = (nx * nx + ny * ny).sqrt() / std::f32::consts::SQRT_2;
                let i = yy * w + xx;
                vig[i] = 1.0 - 0.22 * (r - 0.30).max(0.0).powi(2);
                corner[i] = ((r - 0.70) / 0.30).clamp(0.0, 1.0).powi(2) * 0.20;
            }
        }
        let remap_scale = |plane: &[f32], s: f32| -> Vec<f32> {
            let mut out = vec![0.0f32; n];
            for yy in 0..h {
                for xx in 0..w {
                    let mx = (xx as f32 - cx) * s + cx;
                    let my = (yy as f32 - cy) * s + cy;
                    out[yy * w + xx] = sample_bilinear_reflect(plane, w, h, mx, my);
                }
            }
            out
        };
        planes[0] = remap_scale(&planes[0], 1.0022);
        planes[2] = remap_scale(&planes[2], 0.9978);
        for c in 0..3 {
            let soft = gaussian_blur(&planes[c], w, h, 3.2 * ws, 3.2 * ws);
            for i in 0..n {
                planes[c][i] = (planes[c][i] * (1.0 - corner[i]) + soft[i] * corner[i]) * vig[i];
            }
        }

        // --- 10. sensor noise: shadow-heavy luma + blotchy chroma ---
        if self.noise_scale > 0.0 {
            let mut luma_noise = vec![0.0f32; n];
            for v in luma_noise.iter_mut() {
                *v = self.noise_rng.normal(&mut self.noise_spare);
            }
            let (bw, bh) = ((w / 8).max(1), (h / 8).max(1));
            let mut blotch: Vec<Vec<f32>> = Vec::with_capacity(3);
            for _ in 0..3 {
                let mut g = vec![0.0f32; bw * bh];
                for v in g.iter_mut() {
                    *v = self.noise_rng.normal(&mut self.noise_spare);
                }
                blotch.push(resize_bilinear(&g, bw, bh, w, h));
            }
            let ns = self.noise_scale;
            for i in 0..n {
                let lum = (planes[0][i] + planes[1][i] + planes[2][i]) / 3.0;
                let sigma = (0.010 + 0.055 * dark) * (0.45 + 0.85 * (1.0 - lum).powi(2));
                let blotch_amt = (0.006 + 0.030 * dark) * (0.4 + 0.6 * (1.0 - lum));
                for c in 0..3 {
                    planes[c][i] += (luma_noise[i] * sigma + blotch[c][i] * blotch_amt) * ns;
                }
            }
        }
        for c in 0..3 {
            for v in planes[c].iter_mut() {
                *v = v.clamp(0.0, 1.0);
            }
        }

        // Temporal state: the fully-processed frame.
        let mut prev = vec![0.0f32; n * 3];
        for i in 0..n {
            for c in 0..3 {
                prev[i * 3 + c] = planes[c][i];
            }
        }
        self.prev = Some(prev);

        [planes[0].clone(), planes[1].clone(), planes[2].clone()]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tone_lut_endpoints() {
        let day = build_tone_lut(0.012, 1.06);
        assert_eq!(day[0], 0.0);
        // clip 0.985 through the 0.86 knee at 0.35 slope.
        assert!((day[1023] - 0.90375).abs() < 1e-4, "day top {}", day[1023]);
        let night = build_tone_lut(0.050, 1.12);
        assert!((night[1023] - 0.90375).abs() < 1e-4);
        // Night blacks sit higher mid-toe than day.
        assert!(night[128] > day[128]);
    }

    #[test]
    fn drift_is_bounded_and_deterministic() {
        let a = Drift::new(7);
        let b = Drift::new(7);
        for f in 0..300 {
            let (e1, w1, x1, y1, r1) = a.at(f);
            assert_eq!((e1, w1, x1, y1, r1), b.at(f));
            assert!((0.95..=1.05).contains(&e1), "expo {e1}");
            assert!(x1.abs() <= 1.6 && y1.abs() <= 1.2 && r1.abs() <= 0.06);
        }
    }

    #[test]
    fn still_is_deterministic() {
        let img: Vec<u8> = (0..(64 * 48 * 3)).map(|i| (i % 251) as u8).collect();
        let a = Camcorder::process_still(&img, 64, 48);
        let b = Camcorder::process_still(&img, 64, 48);
        assert_eq!(a, b);
        assert_ne!(a, img);
    }
}
