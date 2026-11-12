//! System tray icon and context menu (Tauri v2).

use crate::errors::AppResult;
use crate::i18n::{self, Lang};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

/// Build the menu for the current language.
fn build_menu(app: &AppHandle, lang: Lang) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItem::with_id(app, "open", i18n::tray_open(lang), true, None::<&str>)?;
    let run = MenuItem::with_id(app, "run_backup", i18n::tray_run(lang), true, None::<&str>)?;
    let autostart = MenuItem::with_id(app, "autostart", i18n::tray_autostart(lang), true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", i18n::tray_quit(lang), true, None::<&str>)?;
    Menu::with_items(app, &[&open, &run, &autostart, &quit])
}

/// Build the system tray icon with its context menu.
pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app, i18n::current_lang())?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            if let Err(e) = handle_menu_event(app, event.id.as_ref()) {
                tracing::error!("Tray menu event error: {}", e);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

/// Rebuild the tray menu in the given language (called after a language change).
pub fn update_tray_language(app: &AppHandle, lang: Lang) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id("main") {
        let menu = build_menu(app, lang)?;
        tray.set_menu(Some(menu))?;
    }
    Ok(())
}

fn handle_menu_event(app: &AppHandle, id: &str) -> AppResult<()> {
    match id {
        "open" => {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        "run_backup" => {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
            let _ = app.emit("tray-run-backup", ());
        }
        "autostart" => {
            let _ = app.emit("tray-toggle-autostart", ());
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
    Ok(())
}
