fn main() {
    tauri_plugin::Builder::new(&["save_photo"]).ios_path("ios").build();
}
