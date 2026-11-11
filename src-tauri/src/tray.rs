//! System tray icon and context menu.

use tauri::{Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem};
use crate::errors::AppResult;

pub fn build_tray() -> SystemTray {
    let menu = SystemTrayMenu::new()
        .add_item(SystemTrayMenuItem::new("Открыть", true, None, "open"))
        .add_item(SystemTrayMenuItem::new("Запустить бэкап", true, None, "run_backup"))
        .add_native_item(SystemTrayMenuItem::separator())
        .add_item(SystemTrayMenuItem::new("Автозапуск", true, None, "autostart"))
        .add_native_item(SystemTrayMenuItem::separator())
        .add_item(SystemTrayMenuItem::new("Выход", true, None, "quit"));

    SystemTray::new().with_menu(menu)
}

pub fn handle_tray_event(app: &tauri::AppHandle, event: SystemTrayEvent) -> AppResult<()> {
    match event {
        SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
            "open" => {
                let window = app.get_webview_window("main");
                if let Some(w) = window {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "run_backup" => {
                // Notify frontend to trigger a backup via command.
                let _ = app.emit("tray-run-backup", serde_json::json!({}));
            }
            "autostart" => {
                let _ = app.emit("tray-toggle-autostart", serde_json::json!({}));
            }
            "quit" => {
                std::process::exit(0);
            }
            _ => {}
        },
        SystemTrayEvent::DoubleClick {
            ..
        } => {
            let window = app.get_webview_window("main");
            if let Some(w) = window {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        _ => {}
    }
    Ok(())
}
