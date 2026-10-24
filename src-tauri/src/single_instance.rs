//! Ensure only one IA Usage process runs — duplicate widgets fight over position/z-order.

use std::fs;
use std::path::PathBuf;

fn lock_path() -> Option<PathBuf> {
    let dir = dirs::data_local_dir()?.join("IA-Usage");
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join("instance.pid"))
}

#[cfg(target_os = "windows")]
fn pid_alive(pid: u32) -> bool {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};

    unsafe {
        match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            Ok(handle) => {
                let _ = CloseHandle(handle);
                true
            }
            Err(_) => false,
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn pid_alive(pid: u32) -> bool {
    // Best-effort: assume stale if we can't check.
    let _ = pid;
    false
}

/// Returns `true` if this process should continue (we own the lock).
pub fn try_acquire() -> bool {
    let Some(path) = lock_path() else {
        return true;
    };

    if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(pid) = raw.trim().parse::<u32>() {
            let self_pid = std::process::id();
            if pid != self_pid && pid_alive(pid) {
                return false;
            }
        }
    }

    if fs::write(&path, std::process::id().to_string()).is_err() {
        return true;
    }
    true
}
