#![cfg(target_os = "ios")]
use tauri::{plugin::{Builder, TauriPlugin}, Runtime};
tauri::ios_plugin_binding!(init_plugin_ios_ui);
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("ios-ui").setup(|_app, api| {
        api.register_ios_plugin(init_plugin_ios_ui)?;
        Ok(())
    }).build()
}
