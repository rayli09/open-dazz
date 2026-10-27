#![cfg(target_os = "ios")]

use serde::{Deserialize, Serialize};
use tauri::{plugin::{Builder, PluginHandle, TauriPlugin}, Manager, Runtime};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_photos);

#[derive(Deserialize, Serialize)]
struct SavePhotoRequest { data: String }

#[derive(Deserialize)]
struct SavePhotoResponse {}

#[tauri::command]
async fn save_photo<R: Runtime>(app: tauri::AppHandle<R>, data: String) -> Result<(), String> {
    let plugin = app.state::<PluginHandle<R>>();
    let _: SavePhotoResponse = plugin.run_mobile_plugin_async("savePhoto", SavePhotoRequest { data }).await.map_err(|e| e.to_string())?;
    Ok(())
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("photos")
        .invoke_handler(tauri::generate_handler![save_photo])
        .setup(|app, api| {
            let handle = api.register_ios_plugin(init_plugin_photos)?;
            app.manage(handle);
            Ok(())
        })
        .build()
}
