//! openfuji-core: camera-agnostic film simulation engine.
//!
//! A recipe (JSON) references a base 3D LUT (.cube) and adds
//! engine parameters: grain, halation, tone, white-balance shift.
//! The same core powers the CLI and (via wasm32) the web app.
//! Core does no file IO: callers hand it bytes / images.
//!
//! # Layout (by domain)
//!
//! - [`math`] — numeric helpers shared by all domains (lerp,
//!   screen blend, Rec.709 luminance, the frozen grain hash).
//! - [`color`] — sRGB/XYZ/CIELAB conversions, one implementation.
//! - [`image`] — u8 <-> f32 pixel/buffer conversions (semantics
//!   are part of the output contract).
//! - [`lut`] — .cube parsing and trilinear sampling.
//! - [`recipe`] — the recipe schema (v0).
//! - [`pipeline`] — the still-image stage chain
//!   (white balance -> LUT -> tone -> halation -> grain), one
//!   module per stage.
//! - [`video`] — per-frame NTSC/VHS composite simulation
//!   (vendored ntsc-rs).
//!
//! The flat re-exports below are the stable public surface;
//! `openfuji_core::vhs` remains as a path via the [`video`]
//! re-export.

pub mod color;
pub mod image;
pub mod lut;
pub mod math;
pub mod pipeline;
pub mod recipe;
pub mod video;

pub use lut::Lut3d;
pub use pipeline::apply_recipe;
pub use recipe::Recipe;
pub use video::vhs;
pub use video::Camcorder;

/// The types and entry points most callers need.
pub mod prelude {
    pub use crate::lut::Lut3d;
    pub use crate::pipeline::apply_recipe;
    pub use crate::recipe::Recipe;
    pub use crate::video::vhs::VhsPreset;
    pub use crate::video::Camcorder;
}
