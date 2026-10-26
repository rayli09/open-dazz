//! White-balance stage: channel gains from the recipe's
//! temperature/tint shifts. Temp warms R and cools B; tint moves G
//! (positive tint_shift = magenta-ward, so G comes down).

use crate::recipe::WhiteBalance;

/// Apply white balance in place to an [r, g, b] pixel in 0..=1.
pub fn apply(px: &mut [f32; 3], wb: &WhiteBalance) {
    px[0] *= 1.0 + 0.10 * wb.temp_shift;
    px[2] *= 1.0 - 0.10 * wb.temp_shift;
    px[1] *= 1.0 - 0.08 * wb.tint_shift;
}

/// Display-referred WB with a smooth shoulder rather than letting
/// amplified channels hit the LUT's input clamp. Black/white remain
/// endpoints; intermediate highlights retain their ordering. This is
/// an artistic JPEG adjustment, not a camera RAW white-balance model.
pub fn apply_photo(px: &mut [f32; 3], wb: &WhiteBalance) {
    let gains = [
        1.0 + 0.10 * wb.temp_shift.clamp(-1.0, 1.0),
        1.0 - 0.08 * wb.tint_shift.clamp(-1.0, 1.0),
        1.0 - 0.10 * wb.temp_shift.clamp(-1.0, 1.0),
    ];
    for (c, gain) in px.iter_mut().zip(gains) {
        *c = *c * gain / (1.0 + *c * (gain - 1.0));
    }
}
