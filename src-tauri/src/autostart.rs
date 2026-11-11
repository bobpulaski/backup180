//! Autostart support via tauri-plugin-autostart.

use crate::errors::{AppError, AppResult};
use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

/// Enable autostart.
pub fn enable_autostart(app: &AppHandle) -> AppResult<()> {
    app.autolaunch()
        .enable()
        .map_err(|e| AppError::Autostart(e.to_string()))
}

/// Disable autostart.
pub fn disable_autostart(app: &AppHandle) -> AppResult<()> {
    app.autolaunch()
        .disable()
        .map_err(|e| AppError::Autostart(e.to_string()))
}

/// Check whether autostart is currently enabled.
pub fn is_autostart_enabled(app: &AppHandle) -> AppResult<bool> {
    app.autolaunch()
        .is_enabled()
        .map_err(|e| AppError::Autostart(e.to_string()))
}
