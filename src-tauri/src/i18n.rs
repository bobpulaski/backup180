//! Minimal localization for backend-generated strings (tray menu, journal messages).
//! The active language is stored in a process-wide cell, set from `settings.json`.

use std::sync::{OnceLock, RwLock};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    Ru,
    En,
}

impl Lang {
    pub fn from_code(code: &str) -> Lang {
        match code {
            "en" => Lang::En,
            _ => Lang::Ru,
        }
    }

    pub fn code(self) -> &'static str {
        match self {
            Lang::Ru => "ru",
            Lang::En => "en",
        }
    }
}

fn cell() -> &'static RwLock<Lang> {
    static LANG: OnceLock<RwLock<Lang>> = OnceLock::new();
    LANG.get_or_init(|| RwLock::new(Lang::Ru))
}

/// Set the process-wide active language.
pub fn set_lang(lang: Lang) {
    if let Ok(mut guard) = cell().write() {
        *guard = lang;
    }
}

/// Get the process-wide active language.
pub fn current_lang() -> Lang {
    cell().read().map(|g| *g).unwrap_or(Lang::Ru)
}

// ---------------------------------------------------------------------------
// Tray menu labels
// ---------------------------------------------------------------------------

pub fn tray_open(l: Lang) -> &'static str {
    match l {
        Lang::Ru => "Открыть",
        Lang::En => "Open",
    }
}

pub fn tray_run(l: Lang) -> &'static str {
    match l {
        Lang::Ru => "Запустить бэкап",
        Lang::En => "Run backup",
    }
}

pub fn tray_autostart(l: Lang) -> &'static str {
    match l {
        Lang::Ru => "Автозапуск",
        Lang::En => "Run at startup",
    }
}

pub fn tray_quit(l: Lang) -> &'static str {
    match l {
        Lang::Ru => "Выход",
        Lang::En => "Quit",
    }
}

// ---------------------------------------------------------------------------
// Journal messages
// ---------------------------------------------------------------------------

pub fn job_created(l: Lang, name: &str) -> String {
    match l {
        Lang::Ru => format!("Задача «{}» создана", name),
        Lang::En => format!("Task \"{}\" created", name),
    }
}

pub fn job_updated(l: Lang, name: &str) -> String {
    match l {
        Lang::Ru => format!("Задача «{}» изменена", name),
        Lang::En => format!("Task \"{}\" updated", name),
    }
}

pub fn job_deleted(l: Lang, name: &str) -> String {
    match l {
        Lang::Ru => format!("Задача «{}» удалена", name),
        Lang::En => format!("Task \"{}\" deleted", name),
    }
}

pub fn run_manual_ok(l: Lang, name: &str, files: u64, bytes: u64) -> String {
    match l {
        Lang::Ru => format!("Задача «{}» выполнена: {} файлов, {} байт", name, files, bytes),
        Lang::En => format!("Task \"{}\" completed: {} files, {} bytes", name, files, bytes),
    }
}

pub fn run_manual_error(l: Lang, name: &str, err: &str) -> String {
    match l {
        Lang::Ru => format!("Задача «{}»: ошибка — {}", name, err),
        Lang::En => format!("Task \"{}\": error — {}", name, err),
    }
}

pub fn run_join_error(l: Lang, name: &str) -> String {
    match l {
        Lang::Ru => format!("Задача «{}»: ошибка запуска задачи", name),
        Lang::En => format!("Task \"{}\": task join failed", name),
    }
}

pub fn run_sched_ok(l: Lang, name: &str, detail: &str) -> String {
    match l {
        Lang::Ru => format!("Задача «{}» выполнена по расписанию: {}", name, detail),
        Lang::En => format!("Task \"{}\" completed on schedule: {}", name, detail),
    }
}

pub fn run_sched_error(l: Lang, name: &str, detail: &str) -> String {
    match l {
        Lang::Ru => format!("Задача «{}»: ошибка по расписанию — {}", name, detail),
        Lang::En => format!("Task \"{}\": scheduled run error — {}", name, detail),
    }
}

pub fn run_sched_ok_generic(l: Lang, name: &str) -> String {
    match l {
        Lang::Ru => format!("Задача «{}» выполнена по расписанию", name),
        Lang::En => format!("Task \"{}\" completed on schedule", name),
    }
}

pub fn run_cancelled(l: Lang, name: &str) -> String {
    match l {
        Lang::Ru => format!("Задача «{}» отменена", name),
        Lang::En => format!("Task \"{}\" cancelled", name),
    }
}

// ---------------------------------------------------------------------------
// System-tray / OS notifications
// ---------------------------------------------------------------------------

pub fn notif_done_title(l: Lang) -> &'static str {
    match l {
        Lang::Ru => "Резервное копирование",
        Lang::En => "Backup",
    }
}

pub fn notif_done_body(l: Lang, name: &str, files: u64, bytes: u64) -> String {
    match l {
        Lang::Ru => format!("Задача «{}» выполнена: {} файлов, {} байт", name, files, bytes),
        Lang::En => format!("Task \"{}\" completed: {} files, {} bytes", name, files, bytes),
    }
}

pub fn notif_error_body(l: Lang, name: &str, err: &str) -> String {
    match l {
        Lang::Ru => format!("Задача «{}»: ошибка — {}", name, err),
        Lang::En => format!("Task \"{}\": error — {}", name, err),
    }
}

pub fn notif_cancelled_body(l: Lang, name: &str) -> String {
    match l {
        Lang::Ru => format!("Задача «{}» отменена", name),
        Lang::En => format!("Task \"{}\" cancelled", name),
    }
}
