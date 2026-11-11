//! Backup180 — Tauri backend library.
//! Public modules exposed to the Tauri command layer.

pub mod commands;
pub mod config;
pub mod errors;
pub mod scheduler;
pub mod backup_engine;
pub mod tray;
pub mod autostart;

use errors::AppResult;

#[cfg(target_os = "windows")]
mod win32;
