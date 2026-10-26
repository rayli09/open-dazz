//! WASM bindings: the web app hands us RGBA pixels + a recipe JSON +
//! the base LUT's .cube text; we hand back developed RGBA pixels.
//! All engine work is openfuji-core — this crate is only the bridge.

use image::{ImageBuffer, RgbImage};
use openfuji_core::{apply_recipe, Lut3d, Recipe};
use wasm_bindgen::prelude::*;

/// Apply a recipe (JSON, same schema as the CLI) with an optional base
/// LUT (.cube text) to an RGBA pixel buffer. Alpha is passed through.
#[wasm_bindgen]
pub fn apply(
    rgba: &[u8],
    width: u32,
    height: u32,
    recipe_json: &str,
    cube_text: Option<String>,
) -> Result<Vec<u8>, JsError> {
    let recipe: Recipe =
        serde_json::from_str(recipe_json).map_err(|e| JsError::new(&e.to_string()))?;
    let lut = match &cube_text {
        Some(text) => Some(Lut3d::parse_cube(text).map_err(|e| JsError::new(&e))?),
        None => None,
    };
    let npix = (width * height) as usize;
    if rgba.len() != npix * 4 {
        return Err(JsError::new("RGBA buffer size does not match dimensions"));
    }
    let mut rgb = Vec::with_capacity(npix * 3);
    for px in rgba.chunks_exact(4) {
        rgb.extend_from_slice(&px[..3]);
    }
    let img: RgbImage = ImageBuffer::from_raw(width, height, rgb)
        .ok_or_else(|| JsError::new("failed to build image"))?;
    let out = apply_recipe(&img, &recipe, lut.as_ref());
    let raw = out.into_raw();
    let mut result = Vec::with_capacity(npix * 4);
    for (i, px) in raw.chunks_exact(3).enumerate() {
        result.extend_from_slice(px);
        result.push(rgba[i * 4 + 3]);
    }
    Ok(result)
}

fn strip_alpha(rgba: &[u8], npix: usize) -> Result<Vec<u8>, JsError> {
    if rgba.len() != npix * 4 {
        return Err(JsError::new("RGBA buffer size does not match dimensions"));
    }
    let mut rgb = Vec::with_capacity(npix * 3);
    for px in rgba.chunks_exact(4) {
        rgb.extend_from_slice(&px[..3]);
    }
    Ok(rgb)
}

fn restore_alpha(rgb: &[u8], rgba: &[u8]) -> Vec<u8> {
    let mut result = Vec::with_capacity(rgb.len() / 3 * 4);
    for (i, px) in rgb.chunks_exact(3).enumerate() {
        result.extend_from_slice(px);
        result.push(rgba[i * 4 + 3]);
    }
    result
}

/// Run the NTSC/VHS composite simulation (vendored ntsc-rs) on an
/// RGBA buffer. `preset`: broadcast | vhs | vhs-heavy. Stills use
/// frame 0; the tape artifacts are deterministic per frame index.
#[wasm_bindgen]
pub fn apply_vhs(
    rgba: &[u8],
    width: u32,
    height: u32,
    preset: &str,
    frame: u32,
) -> Result<Vec<u8>, JsError> {
    let p = openfuji_core::vhs::VhsPreset::parse(preset)
        .ok_or_else(|| JsError::new("unknown VHS preset"))?;
    let npix = (width * height) as usize;
    let mut rgb = strip_alpha(rgba, npix)?;
    openfuji_core::vhs::apply_vhs(&mut rgb, width as usize, height as usize, p, frame as usize);
    Ok(restore_alpha(&rgb, rgba))
}

/// Run the CX405 camcorder simulation on an RGBA buffer (a still
/// is frame 0 of the stream: full pipeline, no temporal smear).
#[wasm_bindgen]
pub fn apply_camcorder(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, JsError> {
    let npix = (width * height) as usize;
    let rgb = strip_alpha(rgba, npix)?;
    let out = openfuji_core::Camcorder::process_still(&rgb, width as usize, height as usize);
    Ok(restore_alpha(&out, rgba))
}

/// Engine version string, for the web app's "about" line.
#[wasm_bindgen]
pub fn engine_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
