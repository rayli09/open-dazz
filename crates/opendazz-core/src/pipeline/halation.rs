//! Halation stage: warm red-orange glow bleeding from bright
//! areas, like light scattering in a film base.
//! Approximation: bright-pass -> gaussian blur -> screen blend
//! with a warm-tinted glow.

use crate::math::{luminance_709, screen};
use image::{DynamicImage, RgbImage};

/// Add halation glow to `img`. `amount` <= 0 returns a clone.
pub fn apply(img: &RgbImage, amount: f32) -> RgbImage {
    if amount <= 0.0 {
        return img.clone();
    }
    let (w, h) = img.dimensions();
    let mut bright = RgbImage::new(w, h);
    for (x, y, px) in img.enumerate_pixels() {
        let lum = luminance_709(px[0] as f32, px[1] as f32, px[2] as f32);
        let t = ((lum - 200.0) / 55.0).clamp(0.0, 1.0);
        bright.put_pixel(
            x,
            y,
            image::Rgb([
                (px[0] as f32 * t) as u8,
                (px[1] as f32 * t * 0.45) as u8,
                (px[2] as f32 * t * 0.25) as u8,
            ]),
        );
    }
    let blurred = DynamicImage::ImageRgb8(bright).blur(6.0).to_rgb8();
    let mut out = img.clone();
    for (x, y, px) in out.enumerate_pixels_mut() {
        let glow = blurred.get_pixel(x, y);
        for c in 0..3 {
            let base = px[c] as f32 / 255.0;
            let gl = glow[c] as f32 / 255.0 * amount;
            px[c] = (screen(base, gl).clamp(0.0, 1.0) * 255.0) as u8;
        }
    }
    out
}
