//! Autostart support (Windows registry Run key).

use crate::errors::{AppError, AppResult};
use std::path::PathBuf;

const REGISTRY_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const REGISTRY_VALUE: &str = "Backup180";

/// Enable autostart by adding the app to the Windows Run registry key.
#[cfg(target_os = "windows")]
pub fn enable_autostart(exe_path: &Path) -> AppResult<()> {
    use winreg::RegKey;
    use winreg::enums::*;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (run_key, _disposition) = hkcu.create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")?;
    run_key.set_value(REGISTRY_VALUE, &exe_path.to_string_lossy().to_string())?;
    Ok(())
}

/// Disable autostart by removing the app from the Run key.
#[cfg(target_os = "windows")]
pub fn disable_autostart() -> AppResult<()> {
    use winreg::RegKey;
    use winreg::enums::*;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run_key = hkcu.open_subkey_with_flags(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
        KEY_SET_VALUE | KEY_WOW64_64KEY,
    )?;
    run_key.delete_value(REGISTRY_VALUE)?;
    Ok(())
}

/// Check if autostart is currently enabled.
#[cfg(target_os = "windows")]
pub fn is_autostart_enabled() -> AppResult<bool> {
    use winreg::RegKey;
    use winreg::enums::*;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    match hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run") {
        Ok(run_key) => match run_key.get_value::<String, _>(REGISTRY_VALUE) {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        },
        Err(_) => Ok(false),
    }
}

/// Stubs for non-Windows platforms (autostart not yet implemented).
#[cfg(not(target_os = "windows"))]
pub fn enable_autostart(_exe_path: &Path) -> AppResult<()> {
    Err(AppError::Autostart("Autostart is only implemented on Windows".into()))
}

#[cfg(not(target_os = "windows"))]
pub fn disable_autostart() -> AppResult<()> {
    Err(AppError::Autostart("Autostart is only implemented on Windows".into()))
}

#[cfg(not(target_os = "windows"))]
pub fn is_autostart_enabled() -> AppResult<bool> {
    Ok(false)
}
