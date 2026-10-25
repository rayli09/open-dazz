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
    let exact_name: Vec<usize> = entries
        .iter()
        .enumerate()
        .filter(|(_, e)| e.name.to_lowercase() == q)
        .map(|(i, _)| i)
        .collect();
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

fn apply_with_recipe(input: &Path, output: &Path, recipe_path: &Path) -> Result<String, String> {
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
    let img = image::open(input)
        .map_err(|e| format!("cannot open {}: {}", input.display(), e))?
        .to_rgb8();
    let out = openfuji_core::apply_recipe(&img, &r, lut.as_ref());
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
        Cmd::Info { recipe } => {
            let r = load_recipe(&recipe)?;
            println!("{}", serde_json::to_string_pretty(&r).unwrap());
            Ok(())
        }
        Cmd::Apply { input, output, recipe, look, root } => {
            let recipe_path = match (recipe, look) {
                (Some(p), _) => p,
                (None, Some(q)) => {
                    let entries = scan_library(&root);
                    match resolve_look(&entries, &q) {
                        Resolution::Found(i) => entries[i].path.clone(),
                        Resolution::Ambiguous(ids) => {
                            return Err(format!(
                                "\"{}\" is ambiguous, be more specific:\n  {}",
                                q,
                                ids.join("\n  ")
                            ))
                        }
                        Resolution::NotFound => {
                            return Err(format!("no look matches \"{}\"", q))
                        }
                    }
                }
                (None, None) => return Err("pass --recipe <path> or --look <name|id>".into()),
            };
            let name = apply_with_recipe(&input, &output, &recipe_path)?;
            println!("{} -> {} (look: {})", input.display(), output.display(), name);
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
