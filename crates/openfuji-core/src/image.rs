//! Pixel/buffer conversions between the `image` crate's u8 world
//! and the pipeline's f32 world.
//!
//! The conversion semantics here are part of the output contract:
//! f32 -> u8 TRUNCATES after clamping (it has never rounded), so
//! every stage's output bytes match what the engine has always
//! produced.

use crate::math::clamp01;

/// One u8 pixel -> [r, g, b] in 0..=1.
#[inline]
pub fn px_to_f32(px: &image::Rgb<u8>) -> [f32; 3] {
    [
        px[0] as f32 / 255.0,
        px[1] as f32 / 255.0,
        px[2] as f32 / 255.0,
    ]
}

/// [r, g, b] in 0..=1 -> one u8 pixel (clamp, scale, truncate).
#[inline]
pub fn f32_to_px(rgb: [f32; 3]) -> image::Rgb<u8> {
    image::Rgb([
        (clamp01(rgb[0]) * 255.0) as u8,
        (clamp01(rgb[1]) * 255.0) as u8,
        (clamp01(rgb[2]) * 255.0) as u8,
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conversions_roundtrip_bytes() {
        for v in [0u8, 1, 63, 128, 200, 254, 255] {
            let px = image::Rgb([v, v, v]);
            assert_eq!(f32_to_px(px_to_f32(&px)), px);
        }
    }

    #[test]
    fn f32_to_px_clamps() {
        assert_eq!(f32_to_px([1.4, -0.2, 0.5]), image::Rgb([255, 0, 127]));
    }
}
