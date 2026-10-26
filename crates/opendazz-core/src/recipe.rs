use serde::{Deserialize, Serialize};

/// Recipe schema v0 (see recipes/README.md). All parameters are
/// engine-relative, not camera menu settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recipe {
    pub name: String,
    /// Path to a .cube LUT, resolved by the caller relative to the recipe file.
    pub base_lut: Option<String>,
    /// Blend of the base LUT stage: 1.0 = full look (default), 0.0 = no LUT.
    /// The bundled LUTs are calibrated for display-referred input
    /// (see docs/COLOR_TEST_CASES.md), so 1.0 is the intended
    /// out-of-box strength; lower values are a creative fade.
    #[serde(default = "default_strength")]
    pub strength: f32,
    /// Opt-in photo rendering for imported Fuji camera-setting recipes.
    /// Omitted on existing/custom looks to preserve their output contract.
    #[serde(default)]
    pub processing: Processing,
    #[serde(default)]
    pub grain: Grain,
    #[serde(default)]
    pub halation: f32,
    #[serde(default)]
    pub tone: Tone,
    #[serde(default)]
    pub white_balance: WhiteBalance,
    pub source: Option<String>,
    pub license: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Processing {
    #[default]
    Legacy,
    FujiPhotoV1,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Grain {
    /// 0.0 = none, 1.0 = heavy.
    #[serde(default)]
    pub amount: f32,
    /// "small" | "large" (large quantizes noise to 2x2 blocks).
    #[serde(default = "default_grain_size")]
    pub size: String,
}

impl Default for Grain {
    fn default() -> Self {
        Grain {
            amount: 0.0,
            size: default_grain_size(),
        }
    }
}

fn default_grain_size() -> String {
    "small".to_string()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Tone {
    /// Fuji-style steps, roughly -4..=+4.
    #[serde(default)]
    pub highlight: f32,
    #[serde(default)]
    pub shadow: f32,
    #[serde(default)]
    pub color: f32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhiteBalance {
    /// -1 (cool) .. +1 (warm)
    #[serde(default)]
    pub temp_shift: f32,
    /// -1 (green) .. +1 (magenta)
    #[serde(default)]
    pub tint_shift: f32,
}

fn default_strength() -> f32 {
    1.0
}

impl Recipe {
    pub fn from_json(s: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(s)
    }
}
