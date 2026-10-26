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

/// Endpoint-preserving tone curve for Fuji camera-setting recipes.
/// Positive highlight brightens the upper range; positive shadow
/// deepens the lower range (increases contrast), rather than lifting
/// blacks. Negative shadow opens shadows. We alter luminance while
/// staying inside the RGB cube, then roll increased chroma gently
/// toward the gamut boundary rather than hard-clipping channels.
/// LUT sampling stays sRGB.
pub fn apply_photo(px: &mut [f32; 3], tone: &Tone) {
    if tone.highlight == 0.0 && tone.shadow == 0.0 && tone.color == 0.0 {
        return;
    }
    let lum = luminance_709(px[0], px[1], px[2]);
    let ev = 0.25
        * (tone.highlight.clamp(-4.0, 4.0) * lum * lum
            - tone.shadow.clamp(-4.0, 4.0) * (1.0 - lum) * (1.0 - lum));
    let gain = ev.exp2();
    let target = lum * gain / (1.0 + lum * (gain - 1.0));
    if target > lum && lum < 1.0 {
        let k = (target - lum) / (1.0 - lum);
        for c in px.iter_mut() {
            *c += (1.0 - *c) * k;
        }
    } else if lum > 0.0 {
        for c in px.iter_mut() {
            *c *= target / lum;
        }
    }
    let sat = (1.0 + 0.10 * tone.color.clamp(-4.0, 4.0)).max(0.0);
    let mut limit = f32::INFINITY;
    for &c in px.iter() {
        let chroma = c - target;
        if chroma > 0.0 {
            limit = limit.min((1.0 - target) / chroma);
        }
        if chroma < 0.0 {
            limit = limit.min(-target / chroma);
        }
    }
    let knee = limit * 0.75;
    let scale = if sat > 1.0 && sat > knee && limit.is_finite() && limit > 0.0 {
        knee + (limit - knee) * (1.0 - (-(sat - knee) / (limit - knee)).exp())
    } else {
        sat.min(limit)
    };
    for c in px.iter_mut() {
        *c = target + (*c - target) * scale;
    }
}
