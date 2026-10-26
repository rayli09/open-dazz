//! Tone stage: luminance-weighted shadow/highlight lift, then
//! saturation around the new luminance (the recipe's `color`).

use crate::math::luminance_709;
use crate::recipe::Tone;

/// Apply tone + saturation in place to an [r, g, b] pixel in 0..=1.
pub fn apply(px: &mut [f32; 3], tone: &Tone) {
    let lum = luminance_709(px[0], px[1], px[2]);
    let sh_w = (1.0 - lum) * (1.0 - lum);
    let hi_w = lum * lum;
    let lift = (tone.shadow / 4.0) * 0.12 * sh_w + (tone.highlight / 4.0) * 0.12 * hi_w;
    px[0] += lift;
    px[1] += lift;
    px[2] += lift;
    let sat = 1.0 + 0.10 * tone.color;
    let lum2 = luminance_709(px[0], px[1], px[2]);
    px[0] = lum2 + (px[0] - lum2) * sat;
    px[1] = lum2 + (px[1] - lum2) * sat;
    px[2] = lum2 + (px[2] - lum2) * sat;
}
