//! Application settings (separate from the jobs config).
//! Persisted to `settings.json` in the Tauri config directory.

use crate::errors::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

const SETTINGS_FILE_NAME: &str = "settings.json";

/// Top-level application settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    /// Interface language code ("ru" | "en").
    #[serde(default = "default_language")]
    pub language: String,
}

fn default_language() -> String {
    "ru".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            language: default_language(),
        }
    }
}

fn settings_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::Config(format!("Cannot resolve app config dir: {e}")))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join(SETTINGS_FILE_NAME))
}

/// Load settings from disk, creating defaults on first run.
pub fn load_settings(app: &tauri::AppHandle) -> AppResult<AppSettings> {
    let path = settings_path(app)?;
    if !path.exists() {
        let default = AppSettings::default();
        save_settings(app, &default)?;
        return Ok(default);
    }
    let data = std::fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&data)?)
}

/// Save settings to disk.
pub fn save_settings(app: &tauri::AppHandle, settings: &AppSettings) -> AppResult<()> {
    let path = settings_path(app)?;
    let data = serde_json::to_string_pretty(settings)?;
    std::fs::write(&path, data)?;
    Ok(())
}
