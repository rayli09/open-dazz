//! Full recipe quality gates, independent of the bare-LUT goldens.
//! These assert useful properties and paired improvements, not camera accuracy.
use image::{Rgb, RgbImage};
use openfuji_core::recipe::Processing;
use openfuji_core::{apply_recipe, Lut3d, Recipe};
use std::path::PathBuf;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn load(path: &str) -> (Recipe, Lut3d) {
    let path = root().join(path);
    let recipe = Recipe::from_json(&std::fs::read_to_string(&path).unwrap()).unwrap();
    let cube = std::fs::read_to_string(
        path.parent()
            .unwrap()
            .join(recipe.base_lut.as_ref().unwrap()),
    )
    .unwrap();
    (recipe, Lut3d::parse_cube(&cube).unwrap())
}
const DOCU: &str = "library/fuji/community/recipes/005-docu-classic-chrome-john-peltier.json";
const VISION: &str = "library/fuji/community/recipes/021-kodak-vision3-500t-piotr-skrzypek.json";

#[test]
fn photo_tone_endpoints_direction_and_monotonicity() {
    let ramp = RgbImage::from_fn(256, 1, |x, _| Rgb([x as u8; 3]));
    // Exhaust all valid Fuji highlight/shadow combinations, including
    // opposite signs. Catch reversals, lifted black, and flattened whites.
    for hi in -4..=4 {
        for sh in -4..=4 {
            let r: Recipe = Recipe::from_json(&format!(r#"{{"name":"probe","processing":"fujiPhotoV1","tone":{{"highlight":{hi},"shadow":{sh}}}}}"#)).unwrap();
            let out = apply_recipe(&ramp, &r, None);
            assert_eq!(out.get_pixel(0, 0), &Rgb([0; 3]));
            assert_eq!(out.get_pixel(255, 0), &Rgb([255; 3]));
            for x in 1..256 {
                assert!(
                    out.get_pixel(x, 0)[0] >= out.get_pixel(x - 1, 0)[0],
                    "reversal hi={hi} sh={sh} x={x}"
                );
            }
            if sh > 0 && hi == 0 {
                assert!(out.get_pixel(48, 0)[0] < 48, "positive shadow must deepen");
            }
            if sh < 0 && hi == 0 {
                assert!(out.get_pixel(48, 0)[0] > 48, "negative shadow must open");
            }
            if hi > 0 && sh == 0 {
                assert!(out.get_pixel(208, 0)[0] > 208);
            }
            if hi < 0 && sh == 0 {
                assert!(out.get_pixel(208, 0)[0] < 208);
            }
        }
    }
}

#[test]
fn nonzero_wb_retains_highlight_gradation_through_real_fuji_luts() {
    let ramp = RgbImage::from_fn(256, 1, |x, _| Rgb([x as u8; 3]));
    for path in std::fs::read_dir(root().join("library/fuji/official/recipes")).unwrap() {
        let p = path.unwrap().path();
        let rel = p.strip_prefix(root()).unwrap().to_str().unwrap();
        let (mut r, lut) = load(rel);
        r.processing = Processing::FujiPhotoV1;
        r.white_balance.temp_shift = 1.0;
        r.white_balance.tint_shift = -1.0;
        r.tone.highlight = 4.0;
        let out = apply_recipe(&ramp, &r, Some(&lut));
        let unique: std::collections::HashSet<_> =
            (220..255).map(|x| out.get_pixel(x, 0)[0]).collect();
        r.processing = Processing::Legacy;
        let legacy = apply_recipe(&ramp, &r, Some(&lut));
        let old_unique: std::collections::HashSet<_> =
            (220..255).map(|x| legacy.get_pixel(x, 0)[0]).collect();
        eprintln!(
            "{} highlight levels legacy={} photo={}",
            r.name,
            old_unique.len(),
            unique.len()
        );
        assert!(
            unique.len() > old_unique.len(),
            "{}: WB/tone must retain more highlight levels than legacy",
            r.name
        );
        for x in 221..255 {
            assert!(
                out.get_pixel(x, 0)[0] >= out.get_pixel(x - 1, 0)[0].saturating_sub(1),
                "{}: highlight reversal",
                r.name
            );
        }
    }
}

#[test]
fn bright_skin_recipe_has_less_channel_clipping_on_actual_public_portrait() {
    let input = image::open(root().join("web/public/samples/sample-1.jpg"))
        .unwrap()
        .to_rgb8();
    // Fixed face/forehead crop of the repository's licensed portrait.
    let face = image::imageops::crop_imm(&input, 420, 370, 400, 420).to_image();
    for path in [DOCU, VISION] {
        let (mut r, lut) = load(path);
        assert_eq!(r.processing, Processing::FujiPhotoV1);
        r.grain.amount = 0.0; // measure tone, not random crossings
        let after = apply_recipe(&face, &r, Some(&lut));
        r.processing = Processing::Legacy;
        let before = apply_recipe(&face, &r, Some(&lut));
        let clipped = |im: &RgbImage| im.pixels().filter(|p| p[0] >= 254).count();
        eprintln!(
            "{} face red>=254 before={} after={}",
            r.name,
            clipped(&before),
            clipped(&after)
        );
        assert!(clipped(&before) > 0, "negative control must expose defect");
        assert!(
            clipped(&after) * 2 < clipped(&before),
            "{} must halve red highlight clipping",
            r.name
        );
    }
}

#[test]
fn all_imported_camera_recipes_opt_in_and_official_bases_remain_unmodified() {
    let mut imported = 0;
    for e in std::fs::read_dir(root().join("library/fuji/community/recipes")).unwrap() {
        let text = std::fs::read_to_string(e.unwrap().path()).unwrap();
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        let r = Recipe::from_json(&text).unwrap();
        if v["provenance"]["sourceRepo"] == "https://github.com/matthieurobin/open-fuji-recipes" {
            imported += 1;
            assert_eq!(r.processing, Processing::FujiPhotoV1);
        } else {
            assert_eq!(r.processing, Processing::Legacy);
        }
    }
    assert_eq!(imported, 204);
    for e in std::fs::read_dir(root().join("library/fuji/official/recipes")).unwrap() {
        let r = Recipe::from_json(&std::fs::read_to_string(e.unwrap().path()).unwrap()).unwrap();
        assert_eq!(r.processing, Processing::Legacy);
        assert_eq!(r.strength, 1.0);
    }
}

#[test]
fn legacy_full_pipeline_matches_pre_change_bytes_for_other_looks() {
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/legacy_pipeline.json")).unwrap();
    let input = RgbImage::from_fn(256, 1, |x, _| {
        Rgb([x as u8, (x * 73 % 256) as u8, (x * 137 % 256) as u8])
    });
    for (path, bytes) in fixture["outputs"].as_object().unwrap() {
        let (r, lut) = load(path);
        assert_eq!(r.processing, Processing::Legacy);
        let out = apply_recipe(&input, &r, Some(&lut));
        let expected: Vec<u8> = bytes
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_u64().unwrap() as u8)
            .collect();
        assert_eq!(out.as_raw(), &expected, "legacy output changed: {path}");
    }
}

#[test]
fn wb_alone_preserves_bright_neutral_and_skin_ramp_order_without_lut() {
    for (temp, tint) in [(1.0, -1.0), (-1.0, 1.0)] {
        for ratios in [[1.0, 1.0, 1.0], [1.0, 0.85, 0.72]] {
            let input = RgbImage::from_fn(256, 1, |x, _| Rgb(ratios.map(|r| (x as f32 * r) as u8)));
            let r: Recipe = Recipe::from_json(&format!(r#"{{"name":"WB","processing":"fujiPhotoV1","whiteBalance":{{"tempShift":{temp},"tintShift":{tint}}}}}"#)).unwrap();
            let out = apply_recipe(&input, &r, None);
            for c in 0..3 {
                for x in 1..256 {
                    assert!(out.get_pixel(x, 0)[c] >= out.get_pixel(x - 1, 0)[c]);
                }
                let levels: std::collections::HashSet<_> =
                    (220..255).map(|x| out.get_pixel(x, 0)[c]).collect();
                assert!(
                    levels.len() >= 20,
                    "WB collapsed bright channel {c}: {} levels",
                    levels.len()
                );
            }
        }
    }
}

#[test]
fn photo_grain_keeps_endpoints_and_does_not_create_hard_clipping() {
    let r: Recipe = Recipe::from_json(
        r#"{"name":"grain","processing":"fujiPhotoV1","grain":{"amount":1,"size":"large"}}"#,
    )
    .unwrap();
    for rgb in [
        [0, 0, 0],
        [255, 255, 255],
        [254, 230, 215],
        [10, 2, 1],
        [128, 128, 128],
    ] {
        let input = RgbImage::from_pixel(64, 64, Rgb(rgb));
        let out = apply_recipe(&input, &r, None);
        assert_eq!(out, apply_recipe(&input, &r, None));
        if rgb == [0, 0, 0] || rgb == [255, 255, 255] {
            assert_eq!(out, input);
        } else {
            assert!(out.pixels().all(|p| p.0.iter().all(|&c| c > 0 && c < 255)));
            if rgb == [128, 128, 128] {
                assert_ne!(out, input, "midtone grain must still be present");
            }
        }
    }
}
