
#[cfg(feature = "smoke-test")]
#[tauri::command]
fn save_smoke_export(name: String, bytes: Vec<u8>) -> Result<(), String> {
    if !["photo.png", "video.mp4"].contains(&name.as_str()) {
        return Err("invalid smoke filename".into());
    }
    let dir = std::env::temp_dir().join("opendazz-smoke");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(name), bytes).map_err(|e| e.to_string())
}
#[cfg(feature = "smoke-test")]
#[tauri::command]
fn finish_smoke(app: tauri::AppHandle, success: bool, detail: String) {
    println!("OPENDAZZ_SMOKE: {success}: {detail}");
    if !success {
        app.exit(1);
    }
}
use tauri::Manager;
#[cfg(not(target_os = "ios"))]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());
    #[cfg(feature = "smoke-test")]
    let builder = builder.invoke_handler(tauri::generate_handler![save_smoke_export, finish_smoke]);
    builder
        .setup(|app| {
            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("OpenDazz")
            .inner_size(1440.0, 960.0)
            .min_inner_size(800.0, 640.0)
            .disable_drag_drop_handler()
            .on_navigation(|url| {
                (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                    || (cfg!(debug_assertions)
                        && url.scheme() == "http"
                        && url.host_str() == Some("127.0.0.1")
                        && url.port() == Some(4173))
            })
            .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("OpenDazz desktop failed")
        .run(|app, event| {
            if let tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::Destroyed,
                ..
            } = &event
            {
                if label == "main" {
                    #[cfg(feature = "smoke-test")]
                    println!("OPENDAZZ_SMOKE: window destroyed normally");
                    app.exit(0);
                }
            }
            if let tauri::RunEvent::ExitRequested {
                api, code: None, ..
            } = event
            {
                if let Some(window) = app.get_webview_window("main") {
                    api.prevent_exit();
                    let _ = window.close();
                }
            }
        });
}

#[cfg(target_os = "ios")]
#[tauri::mobile_entry_point]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_photos::init())
        .plugin(tauri_plugin_ios_ui::init())
        .setup(|app| {
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
                .title("OpenDazz")
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("OpenDazz iOS failed");
}
