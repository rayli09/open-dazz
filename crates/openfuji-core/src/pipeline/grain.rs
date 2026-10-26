//! Grain stage: deterministic monochrome grain. The noise comes
//! from [`crate::math::hash2d`] over block-quantized coordinates
//! — same input, same grain, on every platform and run.

use crate::math::hash2d;
use crate::recipe::Recipe;
use image::RgbImage;

/// Add grain to `img` in place per the recipe's grain settings.
pub fn apply(img: &mut RgbImage, recipe: &Recipe) {
    let amount = recipe.grain.amount;
    if amount <= 0.0 {
        return;
    }
    let block: u32 = if recipe.grain.size == "large" { 2 } else { 1 };
    for (x, y, px) in img.enumerate_pixels_mut() {
        let rand = hash2d(x / block, y / block);
        let delta = (rand - 0.5) * amount * 64.0;
        for c in 0..3 {
            px[c] = (px[c] as f32 + delta).clamp(0.0, 255.0) as u8;
        }
    }
}
