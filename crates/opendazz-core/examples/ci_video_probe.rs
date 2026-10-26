//! Deterministic diagnostic outputs for comparing CI-only refactors.
//! Run against both revisions and compare raw RGB bytes; not camera-fidelity goldens.
use opendazz_core::{
    vhs::{apply_vhs, VhsPreset},
    Camcorder,
};

fn main() {
    let out = std::env::args().nth(1).expect("output directory");
    std::fs::create_dir_all(&out).unwrap();
    for (w, h) in [(64usize, 48usize), (65, 49), (128, 96)] {
        let input: Vec<u8> = (0..w * h * 3)
            .map(|i| ((i * 37 + (i / (w * 3)) * 19) % 256) as u8)
            .collect();
        for name in ["broadcast", "vhs", "vhs-heavy"] {
            for frame in [0, 1, 17] {
                let mut pixels = input.clone();
                apply_vhs(&mut pixels, w, h, VhsPreset::parse(name).unwrap(), frame);
                std::fs::write(format!("{out}/{name}-{w}x{h}-f{frame}.rgb"), pixels).unwrap();
            }
        }
        let mut camcorder = Camcorder::new(7);
        for frame in [0, 1, 17] {
            let pixels = camcorder.process_frame(&input, w, h, frame);
            std::fs::write(format!("{out}/cx405-{w}x{h}-f{frame}.rgb"), pixels).unwrap();
        }
    }
}
