use clap::{Parser, Subcommand};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

#[derive(Parser)]
#[command(name = "openfuji", about = "Apply film simulation recipes to images")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Apply a recipe to an image, by file path (--recipe) or by look
    /// name/id from the library (--look, e.g. "Classic Chrome",
    /// "fuji/community/005-docu-classic-chrome-john-peltier").
    Apply {
        input: PathBuf,
        output: PathBuf,
        #[arg(long, conflicts_with = "look")]
        recipe: Option<PathBuf>,
        #[arg(long)]
        look: Option<String>,
        /// Library root used for --look resolution.
        #[arg(long, default_value = ".")]
        root: PathBuf,
        /// Run the NTSC/VHS composite simulation (ntsc-rs) after the
        /// look: broadcast | vhs | vhs-heavy.
        #[arg(long)]
        vhs: Option<String>,
        /// Full ntsc-rs settings JSON file (the format the ntsc-rs
        /// app saves/loads) — every settings block, not just a
        /// preset. Start from `openfuji vhs-dump <preset>`.
        #[arg(long, conflicts_with = "vhs")]
        vhs_json: Option<PathBuf>,
        /// Run the CX405 camcorder simulation instead of a look
        /// (a still is frame 0 of the camcorder's stream).
        #[arg(long, conflicts_with_all = ["recipe", "look", "vhs", "vhs_json"])]
        camcorder: bool,
        /// Camcorder drift/noise seed.
        #[arg(long, default_value_t = 7)]
        seed: u64,
    },
    /// Apply a look (and optionally the NTSC/VHS simulation) to a
    /// VIDEO: frames are pumped through ffmpeg, graded one by one
    /// (the VHS artifacts animate with the frame number), and the
    /// source audio is copied through untouched. With --camcorder,
    /// frames run through the CX405 simulation and the audio gets
    /// the camcorder's tin-can chain (band-limit, AGC pump, hiss).
    Video {
        input: PathBuf,
        output: PathBuf,
        #[arg(long, conflicts_with = "look")]
        recipe: Option<PathBuf>,
        #[arg(long)]
        look: Option<String>,
        /// Library root used for --look resolution.
        #[arg(long, default_value = ".")]
        root: PathBuf,
        /// NTSC/VHS stage per frame: broadcast | vhs | vhs-heavy.
        #[arg(long)]
        vhs: Option<String>,
        /// Full ntsc-rs settings JSON file (see `openfuji vhs-dump`).
        #[arg(long, conflicts_with = "vhs")]
        vhs_json: Option<PathBuf>,
        /// Process at this width (aspect preserved); the composite
        /// simulation is a standard-definition effect by nature.
        #[arg(long, default_value_t = 960)]
        width: u32,
        /// Run the CX405 camcorder simulation instead of a look.
        #[arg(long, conflicts_with_all = ["recipe", "look", "vhs", "vhs_json"])]
        camcorder: bool,
        /// Camcorder drift/noise seed.
        #[arg(long, default_value_t = 7)]
        seed: u64,
    },
    /// Print a VHS preset's full ntsc-rs settings as JSON (the
    /// starting point for a custom --vhs-json file).
    VhsDump {
        /// broadcast | vhs | vhs-heavy.
        preset: String,
    },
    /// Print a recipe's parsed parameters.
    Info {
        #[arg(long)]
        recipe: PathBuf,
    },
    /// List the library grouped by brand, official looks first.
    List {
        #[arg(long, default_value = ".")]
        root: PathBuf,
        #[arg(long)]
        brand: Option<String>,
    },
}

#[derive(Debug)]
struct LookEntry {
    id: String,
    brand: String,
    tier: String, // "official" | "community" | "examples"
    name: String,
    film: Option<String>,
    has_lut: bool,
    path: PathBuf,
}

const TIERS: [&str; 2] = ["official", "community"];

fn read_look(path: &Path, brand: &str, tier: &str) -> Option<LookEntry> {
    let text = std::fs::read_to_string(path).ok()?;
    let recipe = openfuji_core::Recipe::from_json(&text).ok()?;
    let film = serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| v.get("provenance")?.get("film")?.as_str().map(str::to_string));
    let stem = path.file_stem()?.to_string_lossy().to_string();
    Some(LookEntry {
        id: format!("{}/{}/{}", brand, tier, stem),
        brand: brand.to_string(),
        tier: tier.to_string(),
        name: recipe.name,
        film,
        has_lut: recipe.base_lut.is_some(),
        path: path.to_path_buf(),
    })
}

/// Scan ROOT/library/<brand>/{official,community}/recipes/*.json plus the
/// ungrouped ROOT/recipes/*.json (listed last, as "examples").
fn scan_library(root: &Path) -> Vec<LookEntry> {
    let mut out = Vec::new();
    let lib = root.join("library");
    let mut brands: Vec<PathBuf> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&lib) {
        for e in rd.flatten() {
            if e.path().is_dir() {
                brands.push(e.path());
            }
        }
    }
    brands.sort();
    for brand_dir in brands {
        let brand = brand_dir.file_name().unwrap().to_string_lossy().to_string();
        for tier in TIERS {
            let dir = brand_dir.join(tier).join("recipes");
            if let Ok(rd) = std::fs::read_dir(&dir) {
                let mut files: Vec<PathBuf> = rd
                    .flatten()
                    .map(|e| e.path())
                    .filter(|p| p.extension().is_some_and(|x| x == "json"))
                    .collect();
                files.sort();
                for f in files {
                    if let Some(look) = read_look(&f, &brand, tier) {
                        out.push(look);
                    }
                }
            }
        }
    }
    let ex_dir = root.join("recipes");
    if let Ok(rd) = std::fs::read_dir(&ex_dir) {
        let mut files: Vec<PathBuf> = rd
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|x| x == "json"))
            .collect();
        files.sort();
        for f in files {
            if let Some(look) = read_look(&f, "examples", "examples") {
                out.push(look);
            }
        }
    }
    out
}

#[derive(Debug, PartialEq)]
enum Resolution {
    Found(usize),
    Ambiguous(Vec<String>),
    NotFound,
}

fn resolve_look(entries: &[LookEntry], query: &str) -> Resolution {
    let q = query.to_lowercase();
    let pick = |hits: Vec<usize>| -> Option<Resolution> {
        match hits.len() {
            0 => None,
            1 => Some(Resolution::Found(hits[0])),
            _ => Some(Resolution::Ambiguous(
                hits.iter().map(|&i| entries[i].id.clone()).collect(),
            )),
        }
    };
    let exact_id: Vec<usize> = entries
        .iter()
        .enumerate()
        .filter(|(_, e)| e.id.to_lowercase() == q)
        .map(|(i, _)| i)
        .collect();
    if let Some(r) = pick(exact_id) {
        return r;
    }
    // The bare film name ("Classic Chrome", "Provia/Standard")
    // means the OFFICIAL base simulation — it is the name users
    // say and the one the web shelf features. Community recipes
    // that reuse the bare name stay reachable by id or full name.
    let base_sim: Vec<usize> = entries
        .iter()
        .enumerate()
        .filter(|(_, e)| {
            e.tier == "official"
                && e.name
                    .strip_suffix(" (base simulation)")
                    .map(|n| n.strip_prefix("Fujifilm ").unwrap_or(n).to_lowercase())
                    == Some(q.clone())
        })
        .map(|(i, _)| i)
        .collect();
    if let Some(r) = pick(base_sim) {
        return r;
    }
    let exact_name: Vec<usize> = entries
        .iter()
        .enumerate()
        .filter(|(_, e)| e.name.to_lowercase() == q)
        .map(|(i, _)| i)
        .collect();
    // Several creators name their recipe identically; the official
    // entry, when one is among them, is the canonical pick.
    let official: Vec<usize> = exact_name
        .iter()
        .copied()
        .filter(|&i| entries[i].tier == "official")
        .collect();
    let exact_name = if official.is_empty() { exact_name } else { official };
    if let Some(r) = pick(exact_name) {
        return r;
    }
    let substr: Vec<usize> = entries
        .iter()
        .enumerate()
        .filter(|(_, e)| e.id.to_lowercase().contains(&q) || e.name.to_lowercase().contains(&q))
        .map(|(i, _)| i)
        .collect();
    pick(substr).unwrap_or(Resolution::NotFound)
}

fn load_recipe(path: &Path) -> Result<openfuji_core::Recipe, String> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("cannot read recipe {}: {}", path.display(), e))?;
    openfuji_core::Recipe::from_json(&text)
        .map_err(|e| format!("cannot parse recipe {}: {}", path.display(), e))
}

fn load_recipe_and_lut(recipe_path: &Path) -> Result<(openfuji_core::Recipe, Option<openfuji_core::Lut3d>), String> {
    let r = load_recipe(recipe_path)?;
    let lut = match &r.base_lut {
        Some(rel) => {
            let lut_path = recipe_path.parent().unwrap_or(Path::new(".")).join(rel);
            let text = std::fs::read_to_string(&lut_path)
                .map_err(|e| format!("cannot read LUT {}: {}", lut_path.display(), e))?;
            let lut = openfuji_core::Lut3d::parse_cube(&text)
                .map_err(|e| format!("cannot parse LUT {}: {}", lut_path.display(), e))?;
            Some(lut)
        }
        None => None,
    };
    Ok((r, lut))
}

fn resolve_recipe_path(recipe: &Option<PathBuf>, look: &Option<String>, root: &Path) -> Result<PathBuf, String> {
    match (recipe, look) {
        (Some(p), _) => Ok(p.clone()),
        (None, Some(q)) => {
            let entries = scan_library(root);
            match resolve_look(&entries, q) {
                Resolution::Found(i) => Ok(entries[i].path.clone()),
                Resolution::Ambiguous(ids) => Err(format!(
                    "\"{}\" is ambiguous, be more specific:\n  {}",
                    q,
                    ids.join("\n  ")
                )),
                Resolution::NotFound => Err(format!("no look matches \"{}\"", q)),
            }
        }
        (None, None) => Err("pass --recipe <path> or --look <name|id>".into()),
    }
}

fn parse_vhs(
    v: &Option<String>,
    vhs_json: &Option<PathBuf>,
) -> Result<Option<openfuji_core::vhs::NtscEffectFull>, String> {
    match (v, vhs_json) {
        (Some(_), Some(_)) => Err("--vhs and --vhs-json are mutually exclusive".into()),
        (Some(v), None) => Ok(Some(
            openfuji_core::vhs::VhsPreset::parse(v)
                .ok_or_else(|| format!("unknown --vhs preset \"{v}\" (broadcast | vhs | vhs-heavy)"))?
                .effect(),
        )),
        (None, Some(path)) => {
            let text = std::fs::read_to_string(path)
                .map_err(|e| format!("cannot read {}: {e}", path.display()))?;
            Ok(Some(openfuji_core::vhs::effect_from_json(&text)?))
        }
        (None, None) => Ok(None),
    }
}

fn apply_with_recipe(input: &Path, output: &Path, recipe_path: &Path, vhs: Option<openfuji_core::vhs::NtscEffectFull>) -> Result<String, String> {
    let (r, lut) = load_recipe_and_lut(recipe_path)?;
    let img = image::open(input)
        .map_err(|e| format!("cannot open {}: {}", input.display(), e))?
        .to_rgb8();
    let mut out = openfuji_core::apply_recipe(&img, &r, lut.as_ref());
    if let Some(fx) = &vhs {
        let (w, h) = out.dimensions();
        openfuji_core::vhs::apply_vhs_effect(out.as_mut(), w as usize, h as usize, fx, 0);
    }
    out.save(output)
        .map_err(|e| format!("cannot save {}: {}", output.display(), e))?;
    Ok(r.name)
}

fn list_library(root: &Path, brand_filter: &Option<String>) -> Result<(), String> {
    let entries = scan_library(root);
    if entries.is_empty() {
        println!("no library found under {}", root.display());
        return Ok(());
    }
    let mut current_brand = String::new();
    let mut current_tier = String::new();
    let (mut total, mut shown) = (0usize, 0usize);
    for e in &entries {
        total += 1;
        if let Some(b) = brand_filter {
            if &e.brand != b {
                continue;
            }
        }
        shown += 1;
        if e.brand != current_brand {
            current_brand = e.brand.clone();
            current_tier = String::new();
            println!("\n# {}", current_brand);
        }
        if e.tier != current_tier {
            current_tier = e.tier.clone();
            let n = entries
                .iter()
                .filter(|x| x.brand == current_brand && x.tier == current_tier)
                .count();
            println!("## {} ({})", current_tier, n);
        }
        println!(
            "  {:<52} {:<18} lut:{}",
            e.name,
            e.film.as_deref().unwrap_or("-"),
            if e.has_lut { "yes" } else { "no" }
        );
    }
    println!("\n-- {} looks shown, {} in library", shown, total);
    Ok(())
}

fn run() -> Result<(), String> {
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::List { root, brand } => list_library(&root, &brand),
        Cmd::VhsDump { preset } => {
            let p = openfuji_core::vhs::VhsPreset::parse(&preset)
                .ok_or_else(|| format!("unknown preset \"{preset}\" (broadcast | vhs | vhs-heavy)"))?;
            println!("{}", openfuji_core::vhs::preset_to_json(p)?);
            Ok(())
        }
        Cmd::Info { recipe } => {
            let r = load_recipe(&recipe)?;
            println!("{}", serde_json::to_string_pretty(&r).unwrap());
            Ok(())
        }
        Cmd::Apply { input, output, recipe, look, root, vhs, vhs_json, camcorder, seed } => {
            if camcorder {
                let img = image::open(&input)
                    .map_err(|e| format!("cannot open {}: {}", input.display(), e))?
                    .to_rgb8();
                let (w, h) = img.dimensions();
                let out = openfuji_core::Camcorder::new(seed)
                    .process_frame(img.as_raw(), w as usize, h as usize, 0);
                image::RgbImage::from_raw(w, h, out)
                    .ok_or("camcorder output size mismatch")?
                    .save(&output)
                    .map_err(|e| format!("cannot save {}: {}", output.display(), e))?;
                println!("{} -> {} (camcorder: CX405, seed {})", input.display(), output.display(), seed);
                return Ok(());
            }
            let recipe_path = resolve_recipe_path(&recipe, &look, &root)?;
            let name = apply_with_recipe(&input, &output, &recipe_path, parse_vhs(&vhs, &vhs_json)?)?;
            println!("{} -> {} (look: {})", input.display(), output.display(), name);
            Ok(())
        }
        Cmd::Video { input, output, recipe, look, root, vhs, vhs_json, width, camcorder, seed } => {
            if camcorder {
                let mut cam = openfuji_core::Camcorder::new(seed);
                let mut proc = |buf: &[u8], w: usize, h: usize, frame: usize| {
                    cam.process_frame(buf, w, h, frame as u32)
                };
                let frames = apply_to_video(&input, &output, width, true, &mut proc)?;
                println!("{} -> {} (camcorder: CX405, seed {}, {} frames)", input.display(), output.display(), seed, frames);
                return Ok(());
            }
            let recipe_path = resolve_recipe_path(&recipe, &look, &root)?;
            let (r, lut) = load_recipe_and_lut(&recipe_path)?;
            let fx = parse_vhs(&vhs, &vhs_json)?;
            let mut proc = |buf: &[u8], w: usize, h: usize, frame: usize| {
                let img = image::RgbImage::from_raw(w as u32, h as u32, buf.to_vec())
                    .expect("frame buffer mismatch");
                let mut out = openfuji_core::apply_recipe(&img, &r, lut.as_ref());
                if let Some(fx) = &fx {
                    openfuji_core::vhs::apply_vhs_effect(out.as_mut(), w, h, fx, frame);
                }
                out.into_raw()
            };
            let frames = apply_to_video(&input, &output, width, false, &mut proc)?;
            println!("{} -> {} (look: {}, {} frames)", input.display(), output.display(), r.name, frames);
            Ok(())
        }
    }
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {}", e);
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str, name: &str) -> LookEntry {
        let mut parts = id.split('/');
        LookEntry {
            id: id.to_string(),
            brand: parts.next().unwrap().to_string(),
            tier: parts.next().unwrap().to_string(),
            name: name.to_string(),
            film: None,
            has_lut: true,
            path: PathBuf::from(id),
        }
    }

    #[test]
    fn resolves_exact_name_and_id() {
        let es = vec![
            entry("fuji/official/classic-chrome", "Fujifilm Classic Chrome (base simulation)"),
            entry("fuji/community/005-docu", "Docu Classic Chrome"),
        ];
        assert_eq!(resolve_look(&es, "fuji/official/classic-chrome"), Resolution::Found(0));
        assert_eq!(resolve_look(&es, "docu classic chrome"), Resolution::Found(1));
    }

    #[test]
    fn bare_film_name_means_the_official_simulation() {
        let es = vec![
            entry("fuji/official/classic-chrome", "Fujifilm Classic Chrome (base simulation)"),
            entry("fuji/community/094-x", "Classic Chrome"),
            entry("fuji/community/103-y", "Classic Chrome"),
        ];
        assert_eq!(resolve_look(&es, "classic chrome"), Resolution::Found(0));
        assert_eq!(resolve_look(&es, "fuji/community/094-x"), Resolution::Found(1));
    }

    #[test]
    fn substring_ambiguity_is_reported() {
        let es = vec![
            entry("fuji/community/005-docu", "Docu Classic Chrome"),
            entry("fuji/community/010-contrast", "Classic Chrome Contrast"),
        ];
        match resolve_look(&es, "classic chrome") {
            Resolution::Ambiguous(ids) => assert_eq!(ids.len(), 2),
            other => panic!("expected Ambiguous, got {:?}", other),
        }
        assert_eq!(resolve_look(&es, "nonexistent"), Resolution::NotFound);
    }
}

/// Probe (width, height, fps) via ffprobe.
fn probe_video(input: &Path) -> Result<(u32, u32, f64), String> {
    let out = std::process::Command::new("ffprobe")
        .args(["-v", "error", "-select_streams", "v:0",
               "-show_entries", "stream=width,height,avg_frame_rate",
               "-of", "csv=p=0"])
        .arg(input)
        .output()
        .map_err(|e| format!("cannot run ffprobe: {e}"))?;
    if !out.status.success() {
        return Err(format!("ffprobe failed on {}", input.display()));
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let first = text.lines().next().ok_or("ffprobe returned nothing")?;
    let mut parts = first.split(',');
    let w: u32 = parts.next().and_then(|v| v.trim().parse().ok()).ok_or("bad width")?;
    let h: u32 = parts.next().and_then(|v| v.trim().parse().ok()).ok_or("bad height")?;
    let rate = parts.next().unwrap_or("30/1");
    let mut rp = rate.split('/');
    let num: f64 = rp.next().and_then(|v| v.trim().parse().ok()).unwrap_or(30.0);
    let den: f64 = rp.next().and_then(|v| v.trim().parse().ok()).unwrap_or(1.0);
    Ok((w, h, if den > 0.0 { num / den } else { 30.0 }))
}

/// Does the source carry an audio stream?
fn probe_has_audio(input: &Path) -> bool {
    std::process::Command::new("ffprobe")
        .args(["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0"])
        .arg(input)
        .output()
        .map(|o| !o.stdout.is_empty())
        .unwrap_or(false)
}

/// Source duration in seconds (for sizing the hiss generator).
fn probe_duration(input: &Path) -> f64 {
    let out = std::process::Command::new("ffprobe")
        .args(["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0"])
        .arg(input)
        .output();
    out.ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.trim().parse::<f64>().ok())
        .filter(|d| *d > 0.0)
        .unwrap_or(10.0)
}

/// Grade a whole video: ffmpeg decodes to raw RGB frames, each one
/// runs through `proc` (recipe pipeline, VHS stage, camcorder…),
/// and a second ffmpeg encodes H.264. Audio is copied untouched,
/// except in camcorder mode, where it runs through the CX405's
/// tin-can chain from the Python pipeline (band-limit → stereo
/// narrowing → AGC pump → compressor → + white hiss).
fn apply_to_video(
    input: &Path,
    output: &Path,
    max_width: u32,
    camcorder_audio: bool,
    proc: &mut dyn FnMut(&[u8], usize, usize, usize) -> Vec<u8>,
) -> Result<usize, String> {
    use std::io::{Read, Write};
    let (sw, sh, fps) = probe_video(input)?;
    let scale = (max_width as f64 / sw as f64).min(1.0);
    let mut w = ((sw as f64 * scale).round() as u32) & !1;
    let mut h = ((sh as f64 * scale).round() as u32) & !1;
    if w == 0 { w = 2; }
    if h == 0 { h = 2; }

    let mut decoder = std::process::Command::new("ffmpeg")
        .args(["-v", "error", "-i"])
        .arg(input)
        .args(["-vf", &format!("scale={w}:{h}"), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
        .stdout(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("cannot start ffmpeg decoder: {e}"))?;
    let mut dec_out = decoder.stdout.take().ok_or("decoder stdout missing")?;

    let has_audio = probe_has_audio(input);
    let mut enc_cmd = std::process::Command::new("ffmpeg");
    enc_cmd
        .args(["-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
               "-s", &format!("{w}x{h}"), "-r", &format!("{fps:.4}"), "-i", "-",
               "-i"])
        .arg(input);
    if camcorder_audio && has_audio {
        let dur = probe_duration(input).ceil() as u64 + 1;
        let fc = format!(
            "[1:a]highpass=f=95,lowpass=f=12500,\
             pan=stereo|c0=0.82*c0+0.18*c1|c1=0.82*c1+0.18*c0,\
             dynaudnorm=f=250:g=12:p=0.9,acompressor=threshold=0.5:ratio=3:attack=20:release=250,\
             volume=1.1[a1];\
             anoisesrc=color=white:amplitude=0.0045:d={dur}[hiss];\
             [a1][hiss]amix=inputs=2:duration=first:weights='1 0.5'[aout]"
        );
        enc_cmd.args(["-filter_complex", &fc, "-map", "0:v:0", "-map", "[aout]",
                      "-c:v", "libx264", "-preset", "medium", "-crf", "21",
                      "-maxrate", "11M", "-bufsize", "22M", "-pix_fmt", "yuv420p",
                      "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-shortest",
                      "-movflags", "+faststart"]);
    } else {
        enc_cmd.args(["-map", "0:v:0", "-map", "1:a?", "-c:v", "libx264", "-preset", "medium",
                      "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-shortest",
                      "-movflags", "+faststart"]);
    }
    let mut encoder = enc_cmd
        .arg(output)
        .stdin(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("cannot start ffmpeg encoder: {e}"))?;
    let mut enc_in = encoder.stdin.take().ok_or("encoder stdin missing")?;

    let frame_bytes = (w * h * 3) as usize;
    let mut buf = vec![0u8; frame_bytes];
    let mut frame: usize = 0;
    loop {
        match dec_out.read_exact(&mut buf) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(e) => return Err(format!("frame read failed: {e}")),
        }
        let out = proc(&buf, w as usize, h as usize, frame);
        enc_in.write_all(&out).map_err(|e| format!("encoder write failed: {e}"))?;
        buf = vec![0u8; frame_bytes];
        frame += 1;
        if frame % 60 == 0 {
            eprint!("\r  frame {frame}");
        }
    }
    drop(enc_in);
    let enc_status = encoder.wait().map_err(|e| format!("encoder wait: {e}"))?;
    let _ = decoder.wait();
    if frame > 0 {
        eprintln!("\r  {frame} frames processed");
    }
    if !enc_status.success() {
        return Err("ffmpeg encoder failed".into());
    }
    Ok(frame)
}
