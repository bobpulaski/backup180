//! Scheduler — triggers backup jobs according to their cron-like schedule.
//! Each job runs in its own tokio task (parallel execution supported).

use crate::backup_engine::run_backup;
use crate::config::{AppConfig, BackupJob, Schedule};
use crate::errors::{AppError, AppResult};
use chrono::{Datelike, Local, TimeZone, Timelike};
use std::str::FromStr;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration};

/// Shared scheduler state.
pub struct Scheduler {
    config: Arc<RwLock<AppConfig>>,
}

impl Scheduler {
    pub fn new(config: Arc<RwLock<AppConfig>>) -> Self {
        Self { config }
    }

    /// Compute the next run time (Local) for a schedule, relative to now.
    fn next_run(
        schedule: &Schedule,
        now: chrono::DateTime<Local>,
    ) -> Option<chrono::DateTime<Local>> {
        match schedule {
            Schedule::EveryMinutes { minutes } => {
                let interval = Duration::from_secs(minutes.saturating_mul(60).max(1));
                Some(now + chrono::Duration::from_std(interval).ok()?)
            }
            Schedule::Hourly { minute } => {
                let mut next = now
                    .date_naive()
                    .and_hms_opt(now.hour(), *minute, 0)
                    .unwrap_or_else(|| now.naive_local());
                if next <= now.naive_local() {
                    next += chrono::Duration::hours(1);
                }
                Local.from_local_datetime(&next).single()
            }
            Schedule::Daily { hour, minute } => {
                let mut next = now
                    .date_naive()
                    .and_hms_opt(*hour, *minute, 0)
                    .unwrap_or_else(|| now.naive_local());
                if next <= now.naive_local() {
                    next += chrono::Duration::days(1);
                }
                Local.from_local_datetime(&next).single()
            }
            Schedule::Weekly {
                weekday,
                hour,
                minute,
            } => {
                // weekday: 1=Mon .. 7=Sun
                let mut date = now.date_naive();
                while date.weekday().num_days_from_monday() + 1 != *weekday {
                    date = date.succ_opt()?;
                }
                let mut dt = date.and_hms_opt(*hour, *minute, 0)?;
                if dt <= now.naive_local() {
                    date = date.succ_opt()?;
                    while date.weekday().num_days_from_monday() + 1 != *weekday {
                        date = date.succ_opt()?;
                    }
                    dt = date.and_hms_opt(*hour, *minute, 0)?;
                }
                Local.from_local_datetime(&dt).single()
            }
            Schedule::Cron { expression } => {
                // The `cron` crate expects 6 or 7 fields (with seconds).
                // Accept a standard 5-field expression by prepending a seconds field.
                let expr = {
                    let fields = expression.split_whitespace().count();
                    if fields == 5 {
                        format!("0 {}", expression)
                    } else {
                        expression.clone()
                    }
                };
                let sched = cron::Schedule::from_str(&expr).ok()?;
                sched
                    .upcoming(Local)
                    .next()
                    .map(|dt| dt.with_timezone(&Local))
            }
        }
    }

    /// Delay until the next scheduled run.
    fn delay_until_next(schedule: &Schedule, now: chrono::DateTime<Local>) -> Option<Duration> {
        let next = Self::next_run(schedule, now)?;
        let duration = next.signed_duration_since(now);
        if duration.num_seconds() <= 0 {
            Some(Duration::from_secs(1))
        } else {
            chrono::Duration::to_std(&duration).ok()
        }
    }

    /// Spawn scheduler tasks for every enabled job with a schedule.
    pub async fn spawn_jobs(&self, app_handle: tauri::AppHandle) -> AppResult<()> {
        let jobs: Vec<BackupJob> = {
            let config = self.config.read().await;
            config
                .jobs
                .iter()
                .filter(|j| j.enabled && j.schedule.is_some())
                .cloned()
                .collect()
        };

        for job in jobs {
            let config_clone = Arc::clone(&self.config);
            let handle = app_handle.clone();
            let job_name = job.name.clone();

            tokio::spawn(async move {
                if let Err(e) = Self::job_loop(handle, config_clone, job).await {
                    tracing::error!("Scheduler job '{}' failed: {}", job_name, e);
                }
            });
        }

        Ok(())
    }

    /// Per-job loop: sleep until next run, execute backup, persist status.
    async fn job_loop(
        app_handle: tauri::AppHandle,
        config: Arc<RwLock<AppConfig>>,
        mut job: BackupJob,
    ) -> AppResult<()> {
        loop {
            let now = Local::now();
            let schedule = job.schedule.as_ref().ok_or_else(|| {
                AppError::Scheduler(format!("Job {} has no schedule", job.id))
            })?;

            let delay =
                Self::delay_until_next(schedule, now).unwrap_or_else(|| Duration::from_secs(60));

            sleep(delay).await;

            // Run the backup inside a blocking task (file I/O).
            let job_for_run = job.clone();
            let result = tokio::task::spawn_blocking(move || run_backup(&job_for_run)).await;

            let mut run_files: u64 = 0;
            let mut run_bytes: u64 = 0;
            match result {
                Ok(Ok(res)) => {
                    tracing::info!(
                        "Backup '{}' completed: {} files, {} bytes",
                        job.name,
                        res.files_copied,
                        res.bytes_copied
                    );
                    run_files = res.files_copied;
                    run_bytes = res.bytes_copied;
                    job.last_run = Some(res.finished_at.clone());
                    job.last_status = Some(format!("ok: {} files", res.files_copied));
                }
                Ok(Err(e)) => {
                    tracing::error!("Backup '{}' error: {}", job.name, e);
                    job.last_run = Some(Local::now().to_rfc3339());
                    job.last_status = Some(format!("error: {}", e));
                }
                Err(join_err) => {
                    tracing::error!("Backup task join error: {}", join_err);
                    job.last_status = Some("error: task join failed".into());
                }
            }

            // Persist updated job status.
            {
                let mut cfg = config.write().await;
                if let Some(j) = cfg.jobs.iter_mut().find(|j| j.id == job.id) {
                    j.last_run = job.last_run.clone();
                    j.last_status = job.last_status.clone();
                }
                let lang = crate::i18n::current_lang();
                let (kind, message) = match &job.last_status {
                    Some(s) if s.starts_with("ok:") => (
                        "run_ok",
                        crate::i18n::run_sched_ok(
                            lang,
                            &job.name,
                            s.trim_start_matches("ok: ").trim(),
                        ),
                    ),
                    Some(s) => (
                        "run_error",
                        crate::i18n::run_sched_error(
                            lang,
                            &job.name,
                            s.trim_start_matches("error: ").trim(),
                        ),
                    ),
                    None => ("run_ok", crate::i18n::run_sched_ok_generic(lang, &job.name)),
                };
                crate::config::push_log(&mut cfg, kind, message);
                if let Err(e) = crate::config::save_config(&app_handle, &cfg) {
                    tracing::error!("Failed to persist job status: {}", e);
                }
            }

            // Notify the user about the scheduled run result.
            {
                use tauri_plugin_notification::NotificationExt;
                let lang = crate::i18n::current_lang();
                let (title, body) = match &job.last_status {
                    Some(s) if s.starts_with("ok:") => (
                        crate::i18n::notif_done_title(lang),
                        crate::i18n::notif_done_body(lang, &job.name, run_files, run_bytes),
                    ),
                    Some(s) => (
                        crate::i18n::notif_done_title(lang),
                        crate::i18n::notif_error_body(
                            lang,
                            &job.name,
                            s.trim_start_matches("error: ").trim(),
                        ),
                    ),
                    None => (
                        crate::i18n::notif_done_title(lang),
                        crate::i18n::notif_done_body(lang, &job.name, run_files, run_bytes),
                    ),
                };
                let _ = app_handle
                    .notification()
                    .builder()
                    .title(title)
                    .body(body)
                    .show();
            }

            // Re-read job in case config changed externally (e.g. schedule edit).
            {
                let cfg = config.read().await;
                if let Some(updated) = cfg.jobs.iter().find(|j| j.id == job.id) {
                    job = updated.clone();
                }
            }
        }
    }
}
