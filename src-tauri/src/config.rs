//! Application configuration (jobs, output paths, masks, schedule).
//! Persisted to a JSON file in the Tauri config directory.

use crate::errors::AppResult;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

const CONFIG_FILE_NAME: &str = "backup-jobs.json";

/// Top-level user configuration.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub version: u32,
    pub jobs: Vec<BackupJob>,
    pub autostart: bool,
    pub tray_enabled: bool,
}

/// A single backup task defined by the user.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupJob {
    pub id: String,
    pub name: String,
    pub source_paths: Vec<PathBuf>,
    pub output_path: PathBuf,
    pub include_masks: Vec<String>,
    pub exclude_masks: Vec<String>,
    pub schedule: Option<Schedule>,
    pub enabled: bool,
    pub last_run: Option<String>,
    pub last_status: Option<String>,
}

impl Default for BackupJob {
    fn default() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: String::new(),
            source_paths: Vec::new(),
            output_path: PathBuf::new(),
            include_masks: Vec::new(),
            exclude_masks: Vec::new(),
            schedule: None,
            enabled: false,
            last_run: None,
            last_status: None,
        }
    }
}

/// Cron-like schedule for a backup job.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Schedule {
    /// Run every N minutes.
    EveryMinutes { minutes: u64 },
    /// Run hourly at a given minute.
    Hourly { minute: u32 },
    /// Run daily at HH:MM.
    Daily { hour: u32, minute: u32 },
    /// Run weekly on a weekday at HH:MM.
    Weekly { weekday: u32, hour: u32, minute: u32 },
    /// Raw cron expression (5-field).
    Cron { expression: String },
}

impl Default for Schedule {
    fn default() -> Self {
        Schedule::Daily { hour: 2, minute: 0 }
    }
}

/// Load configuration from the Tauri config dir.
pub fn load_config(app_handle: &tauri::AppHandle) -> AppResult<AppConfig> {
    let config_dir = app_handle
        .path_resolver()
        .app_config_dir()
        .ok_or_else(|| AppError::Config("Cannot resolve app config dir".into()))?;
    std::fs::create_dir_all(&config_dir)?;

    let config_path = config_dir.join(CONFIG_FILE_NAME);
    if !config_path.exists() {
        let default = AppConfig {
            version: 1,
            jobs: Vec::new(),
            autostart: false,
            tray_enabled: true,
        };
        save_config(app_handle, &default)?;
        return Ok(default);
    }

    let data = std::fs::read_to_string(&config_path)?;
    let config: AppConfig = serde_json::from_str(&data)?;
    Ok(config)
}

/// Save configuration to disk.
pub fn save_config(app_handle: &tauri::AppHandle, config: &AppConfig) -> AppResult<()> {
    let config_dir = app_handle
        .path_resolver()
        .app_config_dir()
        .ok_or_else(|| AppError::Config("Cannot resolve app config dir".into()))?;
    std::fs::create_dir_all(&config_dir)?;

    let config_path = config_dir.join(CONFIG_FILE_NAME);
    let data = serde_json::to_string_pretty(config)?;
    std::fs::write(&config_path, data)?;
    Ok(())
}

/// Resolve the data directory for backup output (user documents by default).
pub fn default_output_dir(app_handle: &tauri::AppHandle) -> AppResult<PathBuf> {
    let dirs = app_handle.path_resolver();
    Ok(dirs
        .document_dir()
        .unwrap_or_else(|| dirs.home_dir().unwrap_or_else(PathBuf::new))
        .join("Backup180"))
}
