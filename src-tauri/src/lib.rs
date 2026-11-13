//! Backup180 — Tauri backend library.
//! Public modules exposed to the Tauri command layer.

pub mod autostart;
pub mod backup_engine;
pub mod commands;
pub mod config;
pub mod errors;
pub mod i18n;
pub mod scheduler;
pub mod settings;
pub mod tray;

use std::sync::Arc;
use tauri::Manager;

/// Build and run the Tauri application.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            // Load persistent config.
            let config = config::load_config(app.handle()).unwrap_or_default();
            let state = commands::AppState::new(config);
            app.manage(state);

            // Apply the saved interface language before building the tray.
            if let Ok(settings) = settings::load_settings(app.handle()) {
                i18n::set_lang(i18n::Lang::from_code(&settings.language));
            }

            // Set the window title to "Backup180 — <version>" from package metadata.
            let version = app.package_info().version.to_string();
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(&format!("Backup180 — {version}"));
            }

            // Build and register the system tray.
            tray::build_tray(app.handle())?;

            // Start the scheduler in the background.
            let app_handle = app.handle().clone();
            let config_arc = {
                let state = app.state::<commands::AppState>();
                Arc::clone(&state.config)
            };
            tauri::async_runtime::spawn(async move {
                let scheduler = scheduler::Scheduler::new(config_arc);
                if let Err(e) = scheduler.spawn_jobs(app_handle.clone()).await {
                    tracing::error!("Scheduler failed to start: {}", e);
                }
                let state = app_handle.state::<commands::AppState>();
                let mut guard = state.scheduler.lock().await;
                *guard = Some(scheduler);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_jobs,
            commands::save_job,
            commands::delete_job,
            commands::get_job,
            commands::load_logs,
            commands::clear_logs,
            commands::run_backup_job,
            commands::cancel_backup_job,
            commands::select_folder,
            commands::select_file,
            commands::save_folder,
            commands::get_autostart,
            commands::set_autostart,
            commands::open_main_window,
            commands::reload_scheduler,
            commands::load_settings,
            commands::set_language,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Minimize to tray instead of closing on Windows.
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
