//! Numeric helpers shared by every domain in the core.
//!
//! Anything used by two or more modules lives here exactly once —
//! most importantly the grain hash: its precise integer sequence
//! is part of the engine's output contract (same input, same
//! grain, forever), so it must never be re-implemented per stage.

/// Clamp to the display range 0.0..=1.0.
#[inline]
pub fn clamp01(v: f32) -> f32 {
    v.clamp(0.0, 1.0)
}

/// Linear interpolation.
#[inline]
pub fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

/// Screen blend of two 0..=1 values: `1 - (1-a)(1-b)`.
#[inline]
pub fn screen(a: f32, b: f32) -> f32 {
    1.0 - (1.0 - a) * (1.0 - b)
}

/// Rec.709 luma weights — the single luminance definition used by
/// the tone stage, halation bright-pass, and tests.
#[inline]
pub fn luminance_709(r: f32, g: f32, b: f32) -> f32 {
    0.2126 * r + 0.7152 * g + 0.0722 * b
}

/// Deterministic 2D hash -> 0.0..1.0 (10k steps). This is the
/// grain generator's noise source; the wrapping-integer sequence
/// is frozen — changing any constant changes every rendered
/// image's grain.
#[inline]
pub fn hash2d(x: u32, y: u32) -> f32 {
    let mut n = x.wrapping_mul(0x9E3779B1) ^ y.wrapping_mul(0x85EBCA6B);
    n ^= n >> 13;
    n = n.wrapping_mul(0xC2B2AE35);
    n ^= n >> 16;
    (n % 10000) as f32 / 10000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_is_deterministic_and_in_range() {
        for (x, y) in [(0, 0), (1, 2), (1919, 1079), (u32::MAX, 7)] {
            let v = hash2d(x, y);
            assert_eq!(v, hash2d(x, y));
            assert!((0.0..1.0).contains(&v), "hash {v} out of range");
        }
        assert_ne!(hash2d(3, 4), hash2d(4, 3));
    }

    #[test]
    fn screen_endpoints() {
        assert_eq!(screen(0.0, 0.0), 0.0);
        assert_eq!(screen(1.0, 0.0), 1.0);
        assert_eq!(screen(0.0, 1.0), 1.0);
    }
}
