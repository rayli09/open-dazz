//! Video-domain signal processing: the NTSC/VHS composite
//! simulation (vendored ntsc-rs), applied per frame. Stills use
//! frame 0; video callers pass the running frame index so the
//! tape artifacts animate.

pub mod camcorder;
pub mod phone;
pub mod vhs;

pub use camcorder::Camcorder;
pub use vhs::{
    apply_vhs, apply_vhs_effect, effect_from_json, preset_to_json, NtscEffectFull, VhsPreset,
};
