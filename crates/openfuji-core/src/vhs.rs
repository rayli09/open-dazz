//! VHS / NTSC composite-video simulation, powered by the vendored
//! ntsc-rs core (crates/ntsc-rs — valadaptive/ntsc-rs, MIT OR ISC OR
//! Apache-2.0; see its LICENSE files). This is the same signal chain
//! as the real thing: RGB -> YIQ composite encode with bandwidth
//! limits -> decode, plus tape artifacts (head switching, tracking
//! noise, chroma loss, edge wave) for the VHS presets.
//!
//! Buffers are interleaved RGB8, processed in place. Deterministic
//! for a given (preset, frame) pair — ntsc-rs seeds its noise from
//! `random_seed` + frame number, and we fix both.

use ntsc_rs::settings::standard::VHSTapeSpeed;
use ntsc_rs::yiq_fielding::Rgb;
use ntsc_rs::{Context, NtscEffect};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VhsPreset {
    /// Clean-ish broadcast composite: bandwidth limits and ringing,
    /// no tape damage.
    Broadcast,
    /// A played VHS tape: LP speed, chroma loss, head switching,
    /// tracking noise at ntsc-rs defaults.
    Vhs,
    /// A much-copied tape: EP speed, heavy chroma loss and noise,
    /// stronger head switching.
    VhsHeavy,
}

impl VhsPreset {
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_ascii_lowercase().as_str() {
            "broadcast" | "ntsc" => Some(Self::Broadcast),
            "vhs" => Some(Self::Vhs),
            "vhs-heavy" | "heavy" => Some(Self::VhsHeavy),
            _ => None,
        }
    }

    fn effect(self) -> NtscEffect {
        // Built on ntsc-rs's EASY-mode defaults, converted to the
        // standard settings — that conversion is the profile the
        // ntsc-rs app itself opens with and produces its showcase
        // images from. The raw NtscEffect::default() is a different,
        // much hotter profile (composite sharpening 1.0 vs 0.25,
        // luma smear 0.5 vs 0.2, LP tape, heavier noise blocks):
        // usable as an extreme, wrong as a default. (Found by
        // diffing settings/easy.rs against settings/standard.rs.)
        let mut fx = NtscEffect::from(&ntsc_rs::settings::easy::EasyMode::default());
        match self {
            VhsPreset::Broadcast => {
                // The easy chassis with the tape blocks off.
                fx.vhs_settings.enabled = false;
                fx.head_switching.enabled = false;
                fx.tracking_noise.enabled = false;
            }
            VhsPreset::Vhs => {
                // Exactly the app's default state: SP tape,
                // head-switching 6, edge wave 0.5, gentle noise.
            }
            VhsPreset::VhsHeavy => {
                // The same chassis, worn harder: EP tape, real
                // chroma loss, noise and snow up, a little more smear.
                fx.vhs_settings.settings.tape_speed = VHSTapeSpeed::EP;
                fx.vhs_settings.settings.chroma_loss = 0.5;
                fx.luma_noise.settings.intensity = 0.06;
                fx.chroma_noise.settings.intensity = 0.35;
                fx.snow_intensity = 0.01;
                fx.luma_smear = 0.35;
            }
        }
        fx
    }
}

/// Run the composite simulation over `rgb` (w*h*3 bytes) in place.
/// `frame` drives the animated artifacts (noise, head switching);
/// stills use frame 0.
pub fn apply_vhs(rgb: &mut [u8], width: usize, height: usize, preset: VhsPreset, frame: usize) {
    debug_assert_eq!(rgb.len(), width * height * 3);
    let ctx = Context::new();
    let fx = preset.effect();
    // NTSC's chroma is quarter-resolution horizontally; a scale of
    // [1, 1] treats the buffer as a full-resolution frame.
    fx.apply_effect_to_buffer::<Rgb, u8>(&ctx, (width, height), rgb, frame, [1.0, 1.0]);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gradient(w: usize, h: usize) -> Vec<u8> {
        let mut v = vec![0u8; w * h * 3];
        for y in 0..h {
            for x in 0..w {
                let i = (y * w + x) * 3;
                v[i] = (x * 255 / w.max(1)) as u8;
                v[i + 1] = (y * 255 / h.max(1)) as u8;
                v[i + 2] = 128;
            }
        }
        v
    }

    #[test]
    fn vhs_changes_pixels_and_is_deterministic() {
        let (w, h) = (96, 64);
        let src = gradient(w, h);
        let mut a = src.clone();
        let mut b = src.clone();
        apply_vhs(&mut a, w, h, VhsPreset::Vhs, 0);
        apply_vhs(&mut b, w, h, VhsPreset::Vhs, 0);
        assert_ne!(a, src, "the effect must change the image");
        assert_eq!(a, b, "same preset + frame must be deterministic");
    }

    #[test]
    fn presets_differ() {
        let (w, h) = (96, 64);
        let src = gradient(w, h);
        let mut x = src.clone();
        let mut y = src.clone();
        apply_vhs(&mut x, w, h, VhsPreset::Broadcast, 0);
        apply_vhs(&mut y, w, h, VhsPreset::VhsHeavy, 0);
        assert_ne!(x, y);
    }
}
