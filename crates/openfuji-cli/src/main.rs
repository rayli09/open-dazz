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
    /// Apply a recipe JSON to an image.
    Apply {
        input: PathBuf,
        output: PathBuf,
        /// Path to a recipe .json file. Its baseLut (if any) resolves
        /// relative to the recipe file's directory.
        #[arg(long)]
        recipe: PathBuf,
    },
    /// Print a recipe's parsed parameters.
    Info {
        #[arg(long)]
        recipe: PathBuf,
    },
}

fn load_recipe(path: &Path) -> Result<openfuji_core::Recipe, String> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("cannot read recipe {}: {}", path.display(), e))?;
    openfuji_core::Recipe::from_json(&text)
        .map_err(|e| format!("cannot parse recipe {}: {}", path.display(), e))
}

fn run() -> Result<(), String> {
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Info { recipe } => {
            let r = load_recipe(&recipe)?;
            println!("{}", serde_json::to_string_pretty(&r).unwrap());
            Ok(())
        }
        Cmd::Apply { input, output, recipe } => {
            let r = load_recipe(&recipe)?;
            let lut = match &r.base_lut {
                Some(rel) => {
                    let lut_path = recipe.parent().unwrap_or(Path::new(".")).join(rel);
                    let text = std::fs::read_to_string(&lut_path).map_err(|e| {
                        format!("cannot read LUT {}: {}", lut_path.display(), e)
                    })?;
                    let lut = openfuji_core::Lut3d::parse_cube(&text)
                        .map_err(|e| format!("cannot parse LUT {}: {}", lut_path.display(), e))?;
                    Some(lut)
                }
                None => None,
            };
            let img = image::open(&input)
                .map_err(|e| format!("cannot open {}: {}", input.display(), e))?
                .to_rgb8();
            let out = openfuji_core::apply_recipe(&img, &r, lut.as_ref());
            out.save(&output)
                .map_err(|e| format!("cannot save {}: {}", output.display(), e))?;
            println!("{} -> {} (recipe: {})", input.display(), output.display(), r.name);
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
