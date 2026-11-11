//! Unified error type for the application.

use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Backup engine error: {0}")]
    Backup(String),

    #[error("Scheduler error: {0}")]
    Scheduler(String),

    #[error("Tray error: {0}")]
    Tray(String),

    #[error("Autostart error: {0}")]
    Autostart(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Cron parse error: {0}")]
    Cron(String),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Unknown(e.to_string())
    }
}

impl From<cron::ScheduleParseError> for AppError {
    fn from(e: cron::ScheduleParseError) -> Self {
        AppError::Cron(e.to_string())
    }
}
