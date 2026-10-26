//! Creative, display-sRGB video simulations inspired by early phone cameras.
//! Device specifications constrain detail; color/noise/codec parameters are
//! authored approximations, not measured device profiles or codec emulators.

use crate::image::{resize_area, resize_bilinear};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PhonePreset {
    NokiaN95,
    Iphone4s,
}

impl PhonePreset {
    pub fn parse(name: &str) -> Option<Self> {
        match name {
            "nokia-n95" => Some(Self::NokiaN95),
            "iphone-4s" => Some(Self::Iphone4s),
            _ => None,
        }
    }

    // Fit inside the reference envelope; never crop/stretch portrait or 16:9.
    fn working_size(self, w: usize, h: usize) -> (usize, usize) {
        let (max_w, max_h) = match self {
            Self::NokiaN95 => (640.0_f32, 480.0_f32),
            Self::Iphone4s => (1920.0, 1080.0),
        };
        let scale = (max_w / w as f32).min(max_h / h as f32).min(1.0);
        (
            ((w as f32 * scale).round() as usize).max(1),
            ((h as f32 * scale).round() as usize).max(1),
        )
    }
}

// Frozen integer hash: no mutable history, so seek/repeat/export frame indices
// reproduce the same grain without leaking another media item's previous frame.
fn noise(x: usize, y: usize, frame: u32, salt: u32) -> f32 {
    let mut v = (x as u32).wrapping_mul(0x9e3779b9)
        ^ (y as u32).wrapping_mul(0x85ebca6b)
        ^ frame.wrapping_mul(0xc2b2ae35)
        ^ salt;
    v ^= v >> 16;
    v = v.wrapping_mul(0x7feb352d);
    v ^= v >> 15;
    v = v.wrapping_mul(0x846ca68b);
    v ^= v >> 16;
    (v & 65535) as f32 / 32767.5 - 1.0
}

fn bottleneck(p: &[f32], w: usize, h: usize, ratio: f32) -> Vec<f32> {
    let sw = ((w as f32 * ratio).round() as usize).max(1);
    let sh = ((h as f32 * ratio).round() as usize).max(1);
    resize_bilinear(&resize_area(p, w, h, sw, sh), sw, sh, w, h)
}

/// RGB8 in/out, same geometry. Leaves timing, orientation and audio to caller.
/// A spatial luma/chroma bottleneck, ISP edge emphasis, shadow noise, SDR tone
/// and block/quantization scars approximate an era, not an original bitstream.
pub fn apply_phone(
    rgb: &[u8],
    w: usize,
    h: usize,
    preset: PhonePreset,
    frame: u32,
) -> Result<Vec<u8>, String> {
    if w == 0 || h == 0 || w.checked_mul(h).and_then(|n| n.checked_mul(3)) != Some(rgb.len()) {
        return Err("RGB buffer size does not match positive dimensions".into());
    }
    let (ww, wh) = preset.working_size(w, h);
    let n = ww * wh;
    let old = preset == PhonePreset::NokiaN95;
    let mut planes: Vec<Vec<f32>> = (0..3)
        .map(|c| {
            let p: Vec<f32> = rgb.as_chunks::<3>().0.iter().map(|px| px[c] as f32 / 255.0).collect();
            if (w, h) == (ww, wh) {
                p
            } else {
                resize_area(&p, w, h, ww, wh)
            }
        })
        .collect();
    let mut y = vec![0.0; n];
    let mut cb = vec![0.0; n];
    let mut cr = vec![0.0; n];
    for i in 0..n {
        let (r, g, b) = (planes[0][i], planes[1][i], planes[2][i]);
        y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
        cb[i] = (b - y[i]) * 0.564;
        cr[i] = (r - y[i]) * 0.713;
    }
    if old {
        y = bottleneck(&y, ww, wh, 0.82);
    }
    cb = bottleneck(&cb, ww, wh, if old { 0.32 } else { 0.5 });
    cr = bottleneck(&cr, ww, wh, if old { 0.32 } else { 0.5 });
    let soft = bottleneck(&y, ww, wh, 0.5);
    for row in 0..wh {
        for col in 0..ww {
            let i = row * ww + col;
            let shadow = (1.0 - y[i]).powi(2);
            let grain =
                noise(col, row, frame, 7) * (0.002 + shadow * if old { 0.022 } else { 0.007 });
            // Subtle coherent blocks plus scalar quantization; not actual MPEG-4/H.264 encoding.
            let block = noise(col / 8, row / 8, frame / 3, 23) * if old { 0.004 } else { 0.001 };
            let sharp = if old { 0.18 } else { 0.48 };
            let luma = y[i] + (y[i] - soft[i]) * sharp + grain + block;
            let chroma_noise =
                noise(col / 3, row / 3, frame, 71) * shadow * if old { 0.009 } else { 0.002 };
            let sat = if old { 0.92 } else { 1.04 };
            let u = (cb[i] + chroma_noise) * sat;
            let v = (cr[i] - chroma_noise * 0.6) * sat;
            let channels = [
                luma + 1.403 * v,
                luma - 0.344 * u - 0.714 * v,
                luma + 1.773 * u,
            ];
            for c in 0..3 {
                let gain = if old {
                    [1.025, 1.0, 0.965][c]
                } else {
                    [1.012, 1.0, 0.99][c]
                };
                let value = channels[c] * gain;
                // Early SDR highlight clipping, no HDR reconstruction/tone-map claim.
                let toned = if old {
                    (value - 0.025) * 1.09
                } else {
                    (value - 0.014) * 1.045
                };
                let levels = if old { 96.0 } else { 224.0 };
                planes[c][i] = (toned.clamp(0.0, 1.0) * levels).round() / levels;
            }
        }
    }
    let mut out = vec![0; rgb.len()];
    for c in 0..3 {
        let full = if (w, h) == (ww, wh) {
            std::mem::take(&mut planes[c])
        } else {
            resize_bilinear(&planes[c], ww, wh, w, h)
        };
        for (i, v) in full.iter().enumerate() {
            out[i * 3 + c] = (v.clamp(0.0, 1.0) * 255.0).round() as u8;
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(w: usize, h: usize) -> Vec<u8> {
        (0..w * h)
            .flat_map(|i| {
                let x = i % w;
                let y = i / w;
                [
                    ((x * 7 + y * 3) % 256) as u8,
                    ((x * 2 + y * 5) % 256) as u8,
                    if x % 2 == 0 { 30 } else { 210 },
                ]
            })
            .collect()
    }
    #[test]
    fn reference_envelopes_preserve_framing() {
        assert_eq!(PhonePreset::NokiaN95.working_size(1920, 1080), (640, 360));
        assert_eq!(PhonePreset::NokiaN95.working_size(1080, 1920), (270, 480));
        assert_eq!(PhonePreset::Iphone4s.working_size(3840, 2160), (1920, 1080));
        assert_eq!(PhonePreset::Iphone4s.working_size(240, 320), (240, 320));
    }
    #[test]
    fn repeat_seek_and_other_clip_do_not_change_frames() {
        let src = fixture(63, 47);
        for preset in [PhonePreset::NokiaN95, PhonePreset::Iphone4s] {
            let a = apply_phone(&src, 63, 47, preset, 4).unwrap();
            assert_eq!(a.len(), src.len());
            assert_ne!(a, src);
            assert_ne!(a, apply_phone(&src, 63, 47, preset, 5).unwrap());
            apply_phone(&fixture(32, 24), 32, 24, preset, 99).unwrap();
            assert_eq!(a, apply_phone(&src, 63, 47, preset, 4).unwrap());
        }
        assert_ne!(
            apply_phone(&src, 63, 47, PhonePreset::NokiaN95, 4),
            apply_phone(&src, 63, 47, PhonePreset::Iphone4s, 4)
        );
    }
    #[test]
    fn n95_loses_more_fine_detail_than_4s() {
        let src: Vec<u8> = (0..96 * 64)
            .flat_map(|i| [if i % 2 == 0 { 64 } else { 192 }; 3])
            .collect();
        let contrast = |preset| {
            let px = apply_phone(&src, 96, 64, preset, 0).unwrap();
            px.chunks_exact(96 * 3)
                .map(|row| {
                    row.as_chunks::<3>().0.iter()
                        .zip(row[3..].as_chunks::<3>().0.iter())
                        .map(|(a, b)| (a[0] as f32 - b[0] as f32).abs())
                        .sum::<f32>()
                })
                .sum::<f32>()
        };
        assert!(contrast(PhonePreset::NokiaN95) < contrast(PhonePreset::Iphone4s) * 0.8);
    }
    #[test]
    fn malformed_inputs_rejected_and_tiny_images_supported() {
        assert_eq!(PhonePreset::parse("nokia-n95"), Some(PhonePreset::NokiaN95));
        assert_eq!(PhonePreset::parse("iphone-4s"), Some(PhonePreset::Iphone4s));
        assert_eq!(PhonePreset::parse("iphone"), None);
        for (w, h, src) in [(0, 0, vec![]), (2, 2, vec![0; 3]), (usize::MAX, 2, vec![])] {
            assert!(apply_phone(&src, w, h, PhonePreset::NokiaN95, 0).is_err());
        }
        for preset in [PhonePreset::NokiaN95, PhonePreset::Iphone4s] {
            assert_eq!(
                apply_phone(&[100, 100, 100], 1, 1, preset, 0)
                    .unwrap()
                    .len(),
                3
            );
        }
    }
}
