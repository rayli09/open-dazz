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
