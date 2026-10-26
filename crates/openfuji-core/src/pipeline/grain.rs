//! Grain stage: deterministic monochrome grain. The noise comes
//! from [`crate::math::hash2d`] over block-quantized coordinates
//! — same input, same grain, on every platform and run.

use crate::math::hash2d;
use crate::recipe::Recipe;
use image::RgbImage;

/// Add grain to `img` in place per the recipe's grain settings.
pub fn apply(img: &mut RgbImage, recipe: &Recipe) {
    apply_impl(img, recipe, false);
}

/// Photo grain follows signal level and available channel headroom.
/// It cannot turn near-white skin/sky into new hard-clipped pixels,
/// or lift a true black floor. The legacy noise contract is unchanged.
pub fn apply_photo(img: &mut RgbImage, recipe: &Recipe) {
    apply_impl(img, recipe, true);
}

fn apply_impl(img: &mut RgbImage, recipe: &Recipe, photo: bool) {
    let amount = recipe.grain.amount;
    if amount <= 0.0 {
        return;
    }
    let block: u32 = if recipe.grain.size == "large" { 2 } else { 1 };
    for (x, y, px) in img.enumerate_pixels_mut() {
        let rand = hash2d(x / block, y / block);
        let mut amplitude = amount * 32.0;
        if photo {
            let lum = crate::math::luminance_709(px[0] as f32, px[1] as f32, px[2] as f32) / 255.0;
            let headroom = px.0.iter().map(|&c| c.min(255 - c)).min().unwrap() as f32;
            amplitude =
                (amplitude * (4.0 * lum * (1.0 - lum)).max(0.0).sqrt()).min(headroom * 0.45);
        }
        let delta = if photo {
            (rand - 0.5) * 2.0 * amplitude
        } else {
            (rand - 0.5) * amount * 64.0
        };
        for c in 0..3 {
            let v = (px[c] as f32 + delta).clamp(0.0, 255.0);
            px[c] = if photo { v.round() as u8 } else { v as u8 };
        }
    }
}
