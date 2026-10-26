use std::path::PathBuf;
use std::process::Command;

#[test]
fn help_advertises_opendazz_command() {
    let output = Command::new(env!("CARGO_BIN_EXE_opendazz"))
        .arg("--help")
        .output()
        .unwrap();
    assert!(output.status.success());
    let help = String::from_utf8(output.stdout).unwrap();
    assert!(help.contains("Usage: opendazz"), "{help}");
}

#[test]
fn renamed_cli_develops_a_real_fuji_look() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let input = root.join("examples/test-scene.png");
    let temp = std::env::temp_dir().join(format!("opendazz-cli-test-{}", std::process::id()));
    std::fs::create_dir(&temp).unwrap();
    let output_path = temp.join("developed.png");
    let output = Command::new(env!("CARGO_BIN_EXE_opendazz"))
        .args(["apply"])
        .arg(&input)
        .arg(&output_path)
        .args(["--look", "fuji/official/classic-chrome", "--root"])
        .arg(&root)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let before = image::open(input).unwrap().to_rgb8();
    let after = image::open(&output_path).unwrap().to_rgb8();
    assert_eq!(before.dimensions(), after.dimensions());
    assert_ne!(before, after);
    std::fs::remove_dir_all(temp).unwrap();
}
