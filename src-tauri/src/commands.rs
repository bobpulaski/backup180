//! Tauri commands exposed to the frontend.
//! Each command is callable from JS via `invoke`.

use crate::{
    autostart::{disable_autostart, enable_autostart, is_autostart_enabled},
    backup_engine::run_backup_cancellable,
    config::{push_log, save_config, AppConfig, BackupJob, LogEntry, Schedule},
    errors::{AppError, AppResult},
    i18n::{self, Lang},
    scheduler::Scheduler,
    settings::AppSettings,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

pub struct AppState {
    pub config: Arc<tokio::sync::RwLock<AppConfig>>,
    pub scheduler: tokio::sync::Mutex<Option<Scheduler>>,
    /// Cancel flags for currently running jobs, keyed by job id.
    pub cancels: tokio::sync::Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl AppState {
    pub fn new(config: AppConfig) -> Self {
        Self {
            config: Arc::new(tokio::sync::RwLock::new(config)),
            scheduler: tokio::sync::Mutex::new(None),
            cancels: tokio::sync::Mutex::new(HashMap::new()),
        }
    }

    /// Register a cancel flag for a running job and return it.
    pub async fn begin_run(&self, id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.cancels.lock().await.insert(id.to_string(), flag.clone());
        flag
    }

    /// Remove the cancel flag for a finished job.
    pub async fn end_run(&self, id: &str) {
        self.cancels.lock().await.remove(id);
    }

    /// Signal cancellation for a running job. Returns true if it was running.
    pub async fn cancel_run(&self, id: &str) -> bool {
        let flag = self.cancels.lock().await.get(id).cloned();
        if let Some(f) = flag {
            f.store(true, Ordering::Relaxed);
            true
        } else {
            false
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
    pub group: Option<String>,
}

impl From<&BackupJob> for JobDto {
    fn from(job: &BackupJob) -> Self {
        Self {
            id: job.id.clone(),
            name: job.name.clone(),
            source_paths: job
                .source_paths
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect(),
            output_path: job.output_path.to_string_lossy().to_string(),
            include_masks: job.include_masks.clone(),
            exclude_masks: job.exclude_masks.clone(),
            schedule: job
                .schedule
                .as_ref()
                .map(|s| serde_json::to_value(s).unwrap_or_default()),
            enabled: job.enabled,
            last_run: job.last_run.clone(),
            last_status: job.last_status.clone(),
            group: job.group.clone(),
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
    #[serde(default)]
    pub group: Option<String>,
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
    pub cancelled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LogDto {
    pub id: String,
    pub timestamp: String,
    pub kind: String,
    pub message: String,
}

impl From<&LogEntry> for LogDto {
    fn from(entry: &LogEntry) -> Self {
        Self {
            id: entry.id.clone(),
            timestamp: entry.timestamp.clone(),
            kind: entry.kind.clone(),
            message: entry.message.clone(),
        }
    }
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
pub async fn save_job(
    state: State<'_, AppState>,
    app: AppHandle,
    payload: SaveJobPayload,
) -> AppResult<JobDto> {
    let mut config = state.config.write().await;

    let id = payload
        .id
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let schedule = payload
        .schedule
        .map(serde_json::from_value::<Schedule>)
        .transpose()
        .map_err(|e| AppError::Config(format!("Invalid schedule: {}", e)))?;

    // Preserve last-run metadata when updating an existing job.
    let (last_run, last_status) = config
        .jobs
        .iter()
        .find(|j| j.id == id)
        .map(|j| (j.last_run.clone(), j.last_status.clone()))
        .unwrap_or((None, None));

    let job = BackupJob {
        id,
        name: payload.name,
        source_paths: payload.source_paths.iter().map(PathBuf::from).collect(),
        output_path: PathBuf::from(payload.output_path),
        include_masks: payload.include_masks,
        exclude_masks: payload.exclude_masks,
        schedule,
        enabled: payload.enabled,
        last_run,
        last_status,
        group: payload
            .group
            .map(|g| g.trim().to_string())
            .filter(|g| !g.is_empty()),
    };

    if let Some(pos) = config.jobs.iter().position(|j| j.id == job.id) {
        config.jobs[pos] = job.clone();
        push_log(
            &mut config,
            "updated",
            i18n::job_updated(i18n::current_lang(), &job.name),
        );
    } else {
        config.jobs.push(job.clone());
        push_log(
            &mut config,
            "created",
            i18n::job_created(i18n::current_lang(), &job.name),
        );
    }

    save_config(&app, &config)?;
    Ok(JobDto::from(&job))
}

/// Delete a backup job by id.
#[tauri::command]
pub async fn delete_job(state: State<'_, AppState>, app: AppHandle, id: String) -> AppResult<()> {
    let mut config = state.config.write().await;
    let name = config
        .jobs
        .iter()
        .find(|j| j.id == id)
        .map(|j| j.name.clone())
        .unwrap_or_else(|| id.clone());
    config.jobs.retain(|j| j.id != id);
    push_log(
        &mut config,
        "deleted",
        i18n::job_deleted(i18n::current_lang(), &name),
    );
    save_config(&app, &config)?;
    Ok(())
}

/// Get a single job by id.
#[tauri::command]
pub async fn get_job(state: State<'_, AppState>, id: String) -> AppResult<Option<JobDto>> {
    let config = state.config.read().await;
    Ok(config.jobs.iter().find(|j| j.id == id).map(JobDto::from))
}

/// Load the journal entries, newest first.
#[tauri::command]
pub async fn load_logs(state: State<'_, AppState>) -> AppResult<Vec<LogDto>> {
    let config = state.config.read().await;
    let mut logs: Vec<LogDto> = config.logs.iter().map(LogDto::from).collect();
    logs.reverse();
    Ok(logs)
}

/// Clear the journal.
#[tauri::command]
pub async fn clear_logs(state: State<'_, AppState>, app: AppHandle) -> AppResult<()> {
    let mut config = state.config.write().await;
    config.logs.clear();
    save_config(&app, &config)?;
    Ok(())
}

/// Manually run a backup job.
#[tauri::command]
pub async fn run_backup_job(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
) -> AppResult<BackupRunResult> {
    let job = {
        let config = state.config.read().await;
        config
            .jobs
            .iter()
            .find(|j| j.id == id)
            .cloned()
            .ok_or_else(|| AppError::Config(format!("Job {} not found", id)))?
    };

    let cancel = state.begin_run(&id).await;
    let cancel_for_run = cancel.clone();
    let job_for_run = job.clone();
    let finished =
        tokio::task::spawn_blocking(move || run_backup_cancellable(&job_for_run, &cancel_for_run))
            .await;
    state.end_run(&id).await;

    let result = match finished {
        Ok(Ok(res)) => {
            let lang = i18n::current_lang();
            if res.cancelled {
                persist_status(
                    &app,
                    &state.config,
                    &id,
                    Some(res.finished_at.clone()),
                    Some("cancelled".into()),
                    "run_cancelled",
                    i18n::run_cancelled(lang, &res.job_name),
                )
                .await;
                let _ = app
                    .notification()
                    .builder()
                    .title(i18n::notif_done_title(lang))
                    .body(i18n::notif_cancelled_body(lang, &res.job_name))
                    .show();
            } else {
                persist_status(
                    &app,
                    &state.config,
                    &id,
                    Some(res.finished_at.clone()),
                    Some(format!("ok: {} files", res.files_copied)),
                    "run_ok",
                    i18n::run_manual_ok(lang, &res.job_name, res.files_copied, res.bytes_copied),
                )
                .await;
                let _ = app
                    .notification()
                    .builder()
                    .title(i18n::notif_done_title(lang))
                    .body(i18n::notif_done_body(
                        lang,
                        &res.job_name,
                        res.files_copied,
                        res.bytes_copied,
                    ))
                    .show();
            }
            res
        }
        Ok(Err(e)) => {
            let lang = i18n::current_lang();
            persist_status(
                &app,
                &state.config,
                &id,
                Some(chrono::Local::now().to_rfc3339()),
                Some(format!("error: {}", e)),
                "run_error",
                i18n::run_manual_error(lang, &job.name, &e.to_string()),
            )
            .await;
            let _ = app
                .notification()
                .builder()
                .title(i18n::notif_done_title(lang))
                .body(i18n::notif_error_body(lang, &job.name, &e.to_string()))
                .show();
            return Err(e);
        }
        Err(e) => {
            let lang = i18n::current_lang();
            persist_status(
                &app,
                &state.config,
                &id,
                Some(chrono::Local::now().to_rfc3339()),
                Some("error: task join failed".into()),
                "run_error",
                i18n::run_join_error(lang, &job.name),
            )
            .await;
            return Err(AppError::from(e));
        }
    };

    Ok(BackupRunResult {
        job_id: result.job_id,
        job_name: result.job_name,
        started_at: result.started_at,
        finished_at: result.finished_at,
        files_copied: result.files_copied,
        bytes_copied: result.bytes_copied,
        errors: result.errors,
        cancelled: result.cancelled,
    })
}

/// Cancel a running backup job.
#[tauri::command]
pub async fn cancel_backup_job(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.cancel_run(&id).await;
    Ok(())
}

/// Persist a job's last-run metadata into the shared config and on disk.
async fn persist_status(
    app: &AppHandle,
    config: &Arc<tokio::sync::RwLock<AppConfig>>,
    id: &str,
    last_run: Option<String>,
    last_status: Option<String>,
    log_kind: &str,
    log_message: String,
) {
    let mut cfg = config.write().await;
    if let Some(j) = cfg.jobs.iter_mut().find(|j| j.id == id) {
        j.last_run = last_run;
        j.last_status = last_status;
    }
    push_log(&mut cfg, log_kind, log_message);
    if let Err(e) = save_config(app, &cfg) {
        tracing::error!("Failed to persist job status: {}", e);
    }
}

/// Open a folder picker dialog and return the selected path.
#[tauri::command]
pub async fn select_folder(app: AppHandle) -> AppResult<Option<String>> {
    Ok(app
        .dialog()
        .file()
        .blocking_pick_folder()
        .map(|p| p.to_string()))
}

/// Open a file picker dialog and return the selected path.
#[tauri::command]
pub async fn select_file(app: AppHandle) -> AppResult<Option<String>> {
    Ok(app
        .dialog()
        .file()
        .blocking_pick_file()
        .map(|p| p.to_string()))
}

/// Open a folder picker dialog (used to choose an output destination).
#[tauri::command]
pub async fn save_folder(app: AppHandle) -> AppResult<Option<String>> {
    Ok(app
        .dialog()
        .file()
        .blocking_pick_folder()
        .map(|p| p.to_string()))
}

/// Get autostart status.
#[tauri::command]
pub async fn get_autostart(app: AppHandle) -> AppResult<bool> {
    is_autostart_enabled(&app)
}

/// Set autostart enabled/disabled.
#[tauri::command]
pub async fn set_autostart(app: AppHandle, enabled: bool) -> AppResult<()> {
    if enabled {
        enable_autostart(&app)?;
    } else {
        disable_autostart(&app)?;
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
    scheduler.spawn_jobs(app.clone()).await?;
    let mut sched_guard = state.scheduler.lock().await;
    *sched_guard = Some(scheduler);
    Ok(())
}

/// Load application settings (currently the interface language).
#[tauri::command]
pub async fn load_settings(app: AppHandle) -> AppResult<AppSettings> {
    crate::settings::load_settings(&app)
}

/// Change the interface language and persist it. Rebuilds the tray menu.
#[tauri::command]
pub async fn set_language(app: AppHandle, language: String) -> AppResult<()> {
    let lang = Lang::from_code(&language);
    i18n::set_lang(lang);

    let mut settings = crate::settings::load_settings(&app).unwrap_or_default();
    settings.language = lang.code().to_string();
    crate::settings::save_settings(&app, &settings)?;

    if let Err(e) = crate::tray::update_tray_language(&app, lang) {
        tracing::error!("Failed to update tray language: {}", e);
    }
    Ok(())
}
