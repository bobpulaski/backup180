//! Application entry point.
//! Sets up Tauri, plugins, state, tray and the scheduler.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use crate::{
    commands::{
        load_jobs, save_job, delete_job, get_job, run_backup_job,
        select_folder, select_file, save_folder, get_autostart, set_autostart,
        open_main_window, reload_scheduler, AppState,
    },
    config::load_config,
    tray::{build_tray, handle_tray_event},
    errors::AppResult,
};
use tauri::{Manager, SystemTrayEvent};
use tauri::WindowEvent;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::init())
        .setup(|app| {
            // Load persistent config.
            let config = load_config(app.handle()).unwrap_or_default();
            let state = AppState::new(config);
            app.manage(state);

            // Build and register system tray.
            let tray = build_tray();
            app.system_tray(tray);

            // Start the scheduler in the background (tokio runtime already running).
            let app_handle = app.handle().clone();
            let state_handle = app.state::<AppState>().clone();
            tauri::async_runtime::spawn(async move {
                use crate::scheduler::Scheduler;
                let scheduler = Scheduler::new(Arc::clone(&state_handle.config));
                if let Err(e) = scheduler.spawn_jobs(app_handle.clone()).await {
                    tracing::error!("Scheduler failed to start: {}", e);
                }
                let mut guard = state_handle.scheduler.lock().await;
                *guard = Some(scheduler);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_jobs,
            save_job,
            delete_job,
            get_job,
            run_backup_job,
            select_folder,
            select_file,
            save_folder,
            get_autostart,
            set_autostart,
            open_main_window,
            reload_scheduler,
        ])
        .system_tray(build_tray())
        .on_system_tray_event(|app, event| {
            if let Err(e) = handle_tray_event(app, event) {
                tracing::error!("Tray event error: {}", e);
            }
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Minimize to tray instead of closing on Windows.
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!());
}

use std::sync::Arc;
