//! WASM bindings: the web app hands us RGBA pixels + a recipe JSON +
//! the base LUT's .cube text; we hand back developed RGBA pixels.
//! All engine work is opendazz-core — this crate is only the bridge.

use image::{ImageBuffer, RgbImage};
use opendazz_core::{apply_recipe, Lut3d, Recipe};
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
    for px in rgba.as_chunks::<4>().0 {
        rgb.extend_from_slice(&px[..3]);
    }
    let img: RgbImage = ImageBuffer::from_raw(width, height, rgb)
        .ok_or_else(|| JsError::new("failed to build image"))?;
    let out = apply_recipe(&img, &recipe, lut.as_ref());
    let raw = out.into_raw();
    let mut result = Vec::with_capacity(npix * 4);
    for (i, px) in raw.as_chunks::<3>().0.iter().enumerate() {
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
    for px in rgba.as_chunks::<4>().0 {
        rgb.extend_from_slice(&px[..3]);
    }
    Ok(rgb)
}

fn restore_alpha(rgb: &[u8], rgba: &[u8]) -> Vec<u8> {
    let mut result = Vec::with_capacity(rgb.len() / 3 * 4);
    for (i, px) in rgb.as_chunks::<3>().0.iter().enumerate() {
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
    let p = opendazz_core::vhs::VhsPreset::parse(preset)
        .ok_or_else(|| JsError::new("unknown VHS preset"))?;
    let npix = (width * height) as usize;
    let mut rgb = strip_alpha(rgba, npix)?;
    opendazz_core::vhs::apply_vhs(&mut rgb, width as usize, height as usize, p, frame as usize);
    Ok(restore_alpha(&rgb, rgba))
}

/// Run the CX405 camcorder simulation on an RGBA buffer (a still
/// is frame 0 of the stream: full pipeline, no temporal smear).
#[wasm_bindgen]
pub fn apply_camcorder(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, JsError> {
    let npix = (width * height) as usize;
    let rgb = strip_alpha(rgba, npix)?;
    let out = opendazz_core::Camcorder::process_still(&rgb, width as usize, height as usize);
    Ok(restore_alpha(&out, rgba))
}

/// Early-phone inspired RGB signal processing. Same dimensions and alpha;
/// timing/audio are unchanged. Presets: nokia-n95 | iphone-4s.
#[wasm_bindgen]
pub fn apply_phone(
    rgba: &[u8],
    width: u32,
    height: u32,
    preset: &str,
    frame: u32,
) -> Result<Vec<u8>, JsError> {
    use opendazz_core::video::phone::{apply_phone, PhonePreset};
    let preset = PhonePreset::parse(preset).ok_or_else(|| JsError::new("unknown phone preset"))?;
    let npix = (width as usize)
        .checked_mul(height as usize)
        .filter(|&n| n > 0 && n.checked_mul(4) == Some(rgba.len()))
        .ok_or_else(|| JsError::new("RGBA buffer size does not match positive dimensions"))?;
    let rgb = strip_alpha(rgba, npix)?;
    let out = apply_phone(&rgb, width as usize, height as usize, preset, frame)
        .map_err(|e| JsError::new(&e))?;
    Ok(restore_alpha(&out, rgba))
}

/// Stateful CX405 camcorder for VIDEO: one instance per clip, so
/// the drift/noise streams evolve across frames exactly like the
/// core pipeline (and the CLI) instead of restarting every frame.
#[wasm_bindgen]
pub struct CamcorderSim {
    inner: opendazz_core::Camcorder,
}

#[wasm_bindgen]
impl CamcorderSim {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u64) -> CamcorderSim {
        CamcorderSim { inner: opendazz_core::Camcorder::new(seed) }
    }

    /// Process one RGBA frame; `frame` is the frame index in the
    /// clip (drives the temporal stages).
    pub fn process(
        &mut self,
        rgba: &[u8],
        width: u32,
        height: u32,
        frame: u32,
    ) -> Result<Vec<u8>, JsError> {
        let npix = (width * height) as usize;
        let rgb = strip_alpha(rgba, npix)?;
        let out = self.inner.process_frame(&rgb, width as usize, height as usize, frame);
        Ok(restore_alpha(&out, rgba))
    }
}

/// Engine version string, for the web app's "about" line.
#[wasm_bindgen]
pub fn engine_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::{restore_alpha, strip_alpha};

    #[test]
    fn alpha_conversion_round_trip_preserves_each_pixel() {
        let rgba = [12, 34, 56, 0, 78, 90, 123, 127, 210, 220, 230, 255];
        let rgb = strip_alpha(&rgba, 3).unwrap();
        assert_eq!(rgb, [12, 34, 56, 78, 90, 123, 210, 220, 230]);
        assert_eq!(restore_alpha(&rgb, &rgba), rgba);
        assert!(strip_alpha(&[], 0).unwrap().is_empty());
        assert!(restore_alpha(&[], &[]).is_empty());
    }
}
