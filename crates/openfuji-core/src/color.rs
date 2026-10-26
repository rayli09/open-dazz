//! Color-space conversions: sRGB <-> linear, XYZ, CIELAB (D65).
//!
//! One implementation for the whole workspace. The calibration
//! guardrails (tests/guardrails.rs) carry their own copy pinned
//! to the measurement scripts; this module is the production
//! home for color math as new stages (metrics, gamut work) need
//! it, using the same constants (sRGB primaries, D65 white).

/// sRGB electro-optical transfer: encoded 0..=1 -> linear light.
#[inline]
pub fn srgb_to_linear(c: f32) -> f32 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

/// Inverse of [`srgb_to_linear`]: linear light -> sRGB encoding.
#[inline]
pub fn linear_to_srgb(c: f32) -> f32 {
    let c = c.max(0.0);
    if c <= 0.0031308 {
        12.92 * c
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    }
}

/// Linear sRGB -> CIE XYZ (D65).
pub fn linear_to_xyz(rgb: [f32; 3]) -> [f32; 3] {
    let (r, g, b) = (rgb[0], rgb[1], rgb[2]);
    [
        0.4124 * r + 0.3576 * g + 0.1805 * b,
        0.2126 * r + 0.7152 * g + 0.0722 * b,
        0.0193 * r + 0.1192 * g + 0.9505 * b,
    ]
}

/// sRGB (encoded) -> CIELAB (D65): [L*, a*, b*].
pub fn srgb_to_lab(rgb: [f32; 3]) -> [f32; 3] {
    let lin = [
        srgb_to_linear(rgb[0]),
        srgb_to_linear(rgb[1]),
        srgb_to_linear(rgb[2]),
    ];
    let xyz = linear_to_xyz(lin);
    let x = xyz[0] / 0.95047;
    let y = xyz[1];
    let z = xyz[2] / 1.08883;
    let f = |t: f32| {
        if t > 0.008856 {
            t.max(0.0).cbrt()
        } else {
            7.787 * t + 16.0 / 116.0
        }
    };
    let (fx, fy, fz) = (f(x), f(y), f(z));
    [116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz)]
}

/// CIELAB chroma (C*ab).
pub fn lab_chroma(lab: [f32; 3]) -> f32 {
    (lab[1] * lab[1] + lab[2] * lab[2]).sqrt()
}

/// CIELAB hue angle in degrees, 0..360.
pub fn lab_hue_deg(lab: [f32; 3]) -> f32 {
    let h = lab[2].atan2(lab[1]).to_degrees();
    if h < 0.0 {
        h + 360.0
    } else {
        h
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transfer_roundtrip() {
        for v in [0.0f32, 0.02, 0.18, 0.5, 0.75, 1.0] {
            assert!((linear_to_srgb(srgb_to_linear(v)) - v).abs() < 1e-5);
        }
    }

    #[test]
    fn lab_anchors() {
        let white = srgb_to_lab([1.0, 1.0, 1.0]);
        assert!((white[0] - 100.0).abs() < 0.1, "white L {white:?}");
        assert!(white[1].abs() < 0.05 && white[2].abs() < 0.05);
        let black = srgb_to_lab([0.0, 0.0, 0.0]);
        assert!(black.iter().all(|&v| v.abs() < 0.01));
        // sRGB pure red: the textbook Lab is ~(53.24, 80.09, 67.20).
        let red = srgb_to_lab([1.0, 0.0, 0.0]);
        assert!((red[0] - 53.24).abs() < 0.1, "red L {red:?}");
        assert!((red[1] - 80.09).abs() < 0.15, "red a {red:?}");
        assert!((red[2] - 67.20).abs() < 0.15, "red b {red:?}");
    }
}
