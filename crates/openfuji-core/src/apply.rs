use crate::lut::Lut3d;
use crate::recipe::Recipe;
use image::{DynamicImage, RgbImage};

/// Apply a recipe to an image. Pipeline order (v0):
/// white balance -> 3D LUT -> tone/saturation -> halation -> grain.
pub fn apply_recipe(img: &RgbImage, recipe: &Recipe, lut: Option<&Lut3d>) -> RgbImage {
    let (w, h) = img.dimensions();
    let wb = &recipe.white_balance;
    let tone = &recipe.tone;
    let mut out = RgbImage::new(w, h);

    for (x, y, px) in img.enumerate_pixels() {
        let mut r = px[0] as f32 / 255.0;
        let mut g = px[1] as f32 / 255.0;
        let mut b = px[2] as f32 / 255.0;

        // White balance: temp warms R/cools B, tint moves G.
        r *= 1.0 + 0.10 * wb.temp_shift;
        b *= 1.0 - 0.10 * wb.temp_shift;
        g *= 1.0 - 0.08 * wb.tint_shift;

        // Base LUT, blended by recipe strength.
        if let Some(lut) = lut {
            let s = lut.sample(r, g, b);
            let k = recipe.strength.clamp(0.0, 1.0);
            r += (s[0] - r) * k;
            g += (s[1] - g) * k;
            b += (s[2] - b) * k;
        }

        // Tone: shadow/highlight offsets weighted by luminance; color = saturation.
        let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        let sh_w = (1.0 - lum) * (1.0 - lum);
        let hi_w = lum * lum;
        let lift = (tone.shadow / 4.0) * 0.12 * sh_w + (tone.highlight / 4.0) * 0.12 * hi_w;
        r += lift;
        g += lift;
        b += lift;
        let sat = 1.0 + 0.10 * tone.color;
        let lum2 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = lum2 + (r - lum2) * sat;
        g = lum2 + (g - lum2) * sat;
        b = lum2 + (b - lum2) * sat;

        out.put_pixel(
            x,
            y,
            image::Rgb([
                (r.clamp(0.0, 1.0) * 255.0) as u8,
                (g.clamp(0.0, 1.0) * 255.0) as u8,
                (b.clamp(0.0, 1.0) * 255.0) as u8,
            ]),
        );
    }

    let mut out = halation(&out, recipe.halation);
    grain(&mut out, recipe);
    out
}

/// Halation: warm red-orange glow bleeding from bright areas.
/// v0 approximation: bright-pass -> blur -> screen blend with a warm tint.
fn halation(img: &RgbImage, amount: f32) -> RgbImage {
    if amount <= 0.0 {
        return img.clone();
    }
    let (w, h) = img.dimensions();
    let mut bright = RgbImage::new(w, h);
    for (x, y, px) in img.enumerate_pixels() {
        let lum = 0.2126 * px[0] as f32 + 0.7152 * px[1] as f32 + 0.0722 * px[2] as f32;
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
            // screen blend
            px[c] = ((1.0 - (1.0 - base) * (1.0 - gl)).clamp(0.0, 1.0) * 255.0) as u8;
        }
    }
    out
}

/// Deterministic monochrome grain (same input -> same output; seedless hash).
fn grain(img: &mut RgbImage, recipe: &Recipe) {
    let amount = recipe.grain.amount;
    if amount <= 0.0 {
        return;
    }
    let block: u32 = if recipe.grain.size == "large" { 2 } else { 1 };
    for (x, y, px) in img.enumerate_pixels_mut() {
        let (hx, hy) = (x / block, y / block);
        let mut n = hx.wrapping_mul(0x9E3779B1) ^ hy.wrapping_mul(0x85EBCA6B);
        n ^= n >> 13;
        n = n.wrapping_mul(0xC2B2AE35);
        n ^= n >> 16;
        let rand = (n % 10000) as f32 / 10000.0; // 0.0..1.0
        let delta = (rand - 0.5) * amount * 64.0;
        for c in 0..3 {
            px[c] = (px[c] as f32 + delta).clamp(0.0, 255.0) as u8;
        }
    }
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
