//! Unified error type for the application.

use serde::{Serialize, Serializer};
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

impl From<tokio::task::JoinError> for AppError {
    fn from(e: tokio::task::JoinError) -> Self {
        AppError::Unknown(format!("Task join error: {e}"))
    }
}

/// Commands return `Result<T, AppError>`, and Tauri requires the error type to be
/// `Serialize`. Serialize it as its human-readable `Display` string.
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
