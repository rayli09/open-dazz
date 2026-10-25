//! openfuji-core: camera-agnostic film simulation engine.
//!
//! A recipe (JSON) references a base 3D LUT (.cube) and adds engine
//! parameters: grain, halation, tone, white-balance shift. The same core
//! powers the CLI and (via wasm32) the web app. Core does no file IO:
//! callers hand it bytes / images.

pub mod lut;
pub mod recipe;
pub mod apply;

pub use lut::Lut3d;
pub use recipe::Recipe;
pub use apply::apply_recipe;
