//! Register IA Usage to start with Windows (current user).

use std::env;
use std::path::PathBuf;

#[cfg(target_os = "windows")]
pub fn ensure_autostart() {
    let Ok(exe) = env::current_exe() else {
        return;
    };
    // Skip noisy cargo/dev runs unless explicitly installed under LocalAppData.
    let path_str = exe.to_string_lossy().to_ascii_lowercase();
    let is_dev = path_str.contains(r"\target\debug\") || path_str.contains(r"\node_modules\");
    if is_dev {
        return;
    }

    if let Err(e) = write_run_key(&exe) {
        eprintln!("autostart: {e}");
    }
}

#[cfg(not(target_os = "windows"))]
pub fn ensure_autostart() {}

#[cfg(target_os = "windows")]
fn write_run_key(exe: &PathBuf) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    let exe_display = exe
        .canonicalize()
        .unwrap_or_else(|_| exe.clone())
        .to_string_lossy()
        .trim_start_matches(r"\\?\")
        .replace('\'', "''")
        .to_string();
    let value = format!("\"{exe_display}\"");

    // Registry via PowerShell — no extra crate, CREATE_NO_WINDOW.
    let script = format!(
        "New-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' \
         -Name 'IA Usage' -Value '{value}' -PropertyType String -Force | Out-Null"
    );
    let status = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(0x08000000)
        .status()
        .map_err(|e| e.to_string())?;

    if !status.success() {
        return Err(format!("registry exit {status}"));
    }
    Ok(())
}
