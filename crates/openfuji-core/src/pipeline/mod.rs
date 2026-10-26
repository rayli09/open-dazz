//! The still-image pipeline: an ordered chain of stages over a
//! recipe. Stage order is the engine's core contract —
//!
//!   white balance -> 3D LUT (strength blend) -> tone -> halation -> grain
//!
//! Each stage lives in its own module and is independently
//! testable; this module only orchestrates. Per-pixel stages run
//! in f32 (0..=1); halation and grain are whole-image stages over
//! u8 buffers, as they have always been.

pub mod grain;
pub mod halation;
pub mod tone;
pub mod white_balance;

use crate::image::{f32_to_px, px_to_f32};
use crate::lut::Lut3d;
use crate::recipe::Recipe;
use image::RgbImage;

/// Apply a recipe to an image (see module docs for stage order).
pub fn apply_recipe(img: &RgbImage, recipe: &Recipe, lut: Option<&Lut3d>) -> RgbImage {
    let (w, h) = img.dimensions();
    let mut out = RgbImage::new(w, h);

    for (x, y, px) in img.enumerate_pixels() {
        let mut px = px_to_f32(px);

        white_balance::apply(&mut px, &recipe.white_balance);

        // Base LUT, blended by recipe strength.
        if let Some(lut) = lut {
            let s = lut.sample(px[0], px[1], px[2]);
            let k = recipe.strength.clamp(0.0, 1.0);
            px[0] += (s[0] - px[0]) * k;
            px[1] += (s[1] - px[1]) * k;
            px[2] += (s[2] - px[2]) * k;
        }

        tone::apply(&mut px, &recipe.tone);

        out.put_pixel(x, y, f32_to_px(px));
    }

    let mut out = halation::apply(&out, recipe.halation);
    grain::apply(&mut out, recipe);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recipe::Recipe;

    #[test]
    fn plain_recipe_is_identity_without_lut_or_params() {
        let img = RgbImage::from_pixel(4, 4, image::Rgb([120, 80, 40]));
        let recipe: Recipe = serde_json::from_str(r#"{"name":"noop"}"#).unwrap();
        let out = apply_recipe(&img, &recipe, None);
        assert_eq!(out.get_pixel(0, 0), img.get_pixel(0, 0));
    }

    #[test]
    fn strength_zero_disables_lut() {
        // A LUT that maps everything to red must have no effect at strength 0.
        let cube = "LUT_3D_SIZE 2\n1 0 0\n1 0 0\n1 0 0\n1 0 0\n1 0 0\n1 0 0\n1 0 0\n1 0 0\n";
        let lut = crate::lut::Lut3d::parse_cube(cube).unwrap();
        let img = RgbImage::from_pixel(2, 2, image::Rgb([10, 20, 30]));
        let recipe: Recipe =
            serde_json::from_str(r#"{"name":"s0","strength":0.0}"#).unwrap();
        let out = apply_recipe(&img, &recipe, Some(&lut));
        assert_eq!(out.get_pixel(0, 0), img.get_pixel(0, 0));
        let full: Recipe =
            serde_json::from_str(r#"{"name":"s1","strength":1.0}"#).unwrap();
        let out = apply_recipe(&img, &full, Some(&lut));
        assert_eq!(*out.get_pixel(0, 0), image::Rgb([255, 0, 0]));
    }

    #[test]
    fn grain_is_deterministic() {
        let img = RgbImage::from_pixel(8, 8, image::Rgb([128, 128, 128]));
        let recipe: Recipe =
            serde_json::from_str(r#"{"name":"g","grain":{"amount":0.5,"size":"small"}}"#).unwrap();
        let a = apply_recipe(&img, &recipe, None);
        let b = apply_recipe(&img, &recipe, None);
        assert_eq!(a, b);
    }
}
