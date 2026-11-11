//! Tauri commands exposed to the frontend.
//! Each command is callable from JS via `invoke`.

use crate::{
    backup_engine::run_backup,
    config::{load_config, save_config, AppConfig, BackupJob, Schedule},
    errors::AppResult,
    scheduler::Scheduler,
    autostart::{enable_autostart, disable_autostart, is_autostart_enabled},
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tauri::api::dialog::FileDialogBuilder;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

pub struct AppState {
    pub config: tokio::sync::RwLock<AppConfig>,
    pub scheduler: tokio::sync::Mutex<Option<Scheduler>>,
}

impl AppState {
    pub fn new(config: AppConfig) -> Self {
        Self {
            config: tokio::sync::RwLock::new(config),
            scheduler: tokio::sync::Mutex::new(None),
        }
    }
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct JobDto {
    pub id: String,
    pub name: String,
    pub source_paths: Vec<String>,
    pub output_path: String,
    pub include_masks: Vec<String>,
    pub exclude_masks: Vec<String>,
    pub schedule: Option<serde_json::Value>,
    pub enabled: bool,
    pub last_run: Option<String>,
    pub last_status: Option<String>,
}

impl From<&BackupJob> for JobDto {
    fn from(job: &BackupJob) -> Self {
        Self {
            id: job.id.clone(),
            name: job.name.clone(),
            source_paths: job.source_paths.iter().map(|p| p.to_string_lossy().to_string()).collect(),
            output_path: job.output_path.to_string_lossy().to_string(),
            include_masks: job.include_masks.clone(),
            exclude_masks: job.exclude_masks.clone(),
            schedule: job.schedule.as_ref().map(|s| serde_json::to_value(s).unwrap_or_default()),
            enabled: job.enabled,
            last_run: job.last_run.clone(),
            last_status: job.last_status.clone(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct SaveJobPayload {
    pub id: Option<String>,
    pub name: String,
    pub source_paths: Vec<String>,
    pub output_path: String,
    pub include_masks: Vec<String>,
    pub exclude_masks: Vec<String>,
    pub schedule: Option<serde_json::Value>,
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
pub struct BackupRunResult {
    pub job_id: String,
    pub job_name: String,
    pub started_at: String,
    pub finished_at: String,
    pub files_copied: u64,
    pub bytes_copied: u64,
    pub errors: Vec<String>,
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Load all backup jobs.
#[tauri::command]
pub async fn load_jobs(state: State<'_, AppState>) -> AppResult<Vec<JobDto>> {
    let config = state.config.read().await;
    Ok(config.jobs.iter().map(JobDto::from).collect())
}

/// Save (create or update) a backup job.
#[tauri::command]
pub async fn save_job(state: State<'_, AppState>, app: AppHandle, payload: SaveJobPayload) -> AppResult<JobDto> {
    let mut config = state.config.write().await;

    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let schedule = payload.schedule.map(|v| serde_json::from_value::<Schedule>(v))
        .transpose()
        .map_err(|e| AppError::Config(format!("Invalid schedule: {}", e)))?;

    let job = BackupJob {
        id,
        name: payload.name,
        source_paths: payload.source_paths.iter().map(PathBuf::from).collect(),
        output_path: PathBuf::from(payload.output_path),
        include_masks: payload.include_masks,
        exclude_masks: payload.exclude_masks,
        schedule,
        enabled: payload.enabled,
        last_run: None,
        last_status: None,
    };

    if let Some(pos) = config.jobs.iter().position(|j| j.id == job.id) {
        config.jobs[pos] = job.clone();
    } else {
        config.jobs.push(job.clone());
    }

    save_config(&app, &config)?;
    Ok(JobDto::from(&job))
}

/// Delete a backup job by id.
#[tauri::command]
pub async fn delete_job(state: State<'_, AppState>, app: AppHandle, id: String) -> AppResult<()> {
    let mut config = state.config.write().await;
    config.jobs.retain(|j| j.id != id);
    save_config(&app, &config)?;
    Ok(())
}

/// Get a single job by id.
#[tauri::command]
pub async fn get_job(state: State<'_, AppState>, id: String) -> AppResult<Option<JobDto>> {
    let config = state.config.read().await;
    Ok(config.jobs.iter().find(|j| j.id == id).map(JobDto::from))
}

/// Manually run a backup job.
#[tauri::command]
pub async fn run_backup_job(state: State<'_, AppState>, id: String) -> AppResult<BackupRunResult> {
    let config = state.config.read().await;
    let job = config
        .jobs
        .iter()
        .find(|j| j.id == id)
        .cloned()
        .ok_or_else(|| AppError::Config(format!("Job {} not found", id)))?;
    drop(config);

    let result = tokio::task::spawn_blocking(move || run_backup(&job))??;
    Ok(BackupRunResult {
        job_id: result.job_id,
        job_name: result.job_name,
        started_at: result.started_at,
        finished_at: result.finished_at,
        files_copied: result.files_copied,
        bytes_copied: result.bytes_copied,
        errors: result.errors,
    })
}

/// Open a folder picker dialog and return the selected path.
#[tauri::command]
pub async fn select_folder(_app: AppHandle) -> AppResult<Option<String>> {
    let (tx, rx) = mpsc::channel();

    FileDialogBuilder::new()
        .select_folder(move |path| {
            let _ = tx.send(path.map(|p| p.to_string_lossy().to_string()));
        });

    let result = rx.recv_timeout(std::time::Duration::from_secs(300));
    match result {
        Ok(p) => Ok(p),
        Err(_) => Err(AppError::Config("Folder dialog timed out".into())),
    }
}

/// Open a file picker dialog and return the selected path.
#[tauri::command]
pub async fn select_file(_app: AppHandle) -> AppResult<Option<String>> {
    let (tx, rx) = mpsc::channel();

    FileDialogBuilder::new()
        .select_file(move |path| {
            let _ = tx.send(path.map(|p| p.to_string_lossy().to_string()));
        });

    let result = rx.recv_timeout(std::time::Duration::from_secs(300));
    match result {
        Ok(p) => Ok(p),
        Err(_) => Err(AppError::Config("File dialog timed out".into())),
    }
}

/// Save a folder picker dialog (output destination) and return the selected path.
#[tauri::command]
pub async fn save_folder(_app: AppHandle) -> AppResult<Option<String>> {
    let (tx, rx) = mpsc::channel();

    FileDialogBuilder::new()
        .save_file(move |path| {
            let _ = tx.send(path.map(|p| p.to_string_lossy().to_string()));
        });

    let result = rx.recv_timeout(std::time::Duration::from_secs(300));
    match result {
        Ok(p) => Ok(p),
        Err(_) => Err(AppError::Config("Save dialog timed out".into())),
    }
}

/// Get autostart status.
#[tauri::command]
pub async fn get_autostart() -> AppResult<bool> {
    is_autostart_enabled()
}

/// Set autostart enabled/disabled.
#[tauri::command]
pub async fn set_autostart(enabled: bool, app: AppHandle) -> AppResult<()> {
    let exe_path = app
        .path_resolver()
        .exe_path()
        .unwrap_or_else(|| std::env::current_exe().unwrap_or_else(|_| PathBuf::from("")));

    if enabled {
        enable_autostart(&exe_path)?;
    } else {
        disable_autostart()?;
    }
    Ok(())
}

/// Open / focus the main window.
#[tauri::command]
pub async fn open_main_window(app: AppHandle) -> AppResult<()> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
    Ok(())
}

/// Reload scheduler after config change.
#[tauri::command]
pub async fn reload_scheduler(state: State<'_, AppState>, app: AppHandle) -> AppResult<()> {
    let scheduler = Scheduler::new(Arc::clone(&state.config));
    scheduler.spawn_jobs(app.clone())?;
    let mut sched_guard = state.scheduler.lock().await;
    *sched_guard = Some(scheduler);
    Ok(())
}
