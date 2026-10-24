mod autostart;
mod cursor_anchor;
mod cursor_sync;
mod native_mascot;
mod single_instance;
mod usage;

use tauri::{AppHandle, Manager};
use usage::{import_cursor_csv_content, load_merged_usage, CursorImportResult, MergedUsageResponse};

#[tauri::command]
fn get_merged_usage(days: u32, app: AppHandle) -> Result<MergedUsageResponse, String> {
    load_merged_usage(days, &app)
}

#[tauri::command]
fn import_cursor_csv(content: String, app: AppHandle) -> Result<CursorImportResult, String> {
    import_cursor_csv_content(&content, &app, None, false)
}

#[tauri::command]
fn auto_import_cursor_csv(app: AppHandle) -> Result<Option<CursorImportResult>, String> {
    // Force a fresh pull from cursor.com (ignores the once-per-day gate).
    usage::ensure_cursor_usage(&app, true)
}

pub(crate) fn show_dashboard_inner(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Err("Dashboard window not found".into());
    };

    // Never abort on focus failures — the window must still open.
    let _ = window.unminimize();
    window.show().map_err(|e| e.to_string())?;

    // Pulse always-on-top so the dashboard surfaces above Cursor/Claude.
    let _ = window.set_always_on_top(true);
    let _ = window.set_focus();

    #[cfg(target_os = "windows")]
    {
        force_foreground_window(&window);
    }

    let _ = window.set_always_on_top(false);
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
fn show_dashboard(app: AppHandle) -> Result<(), String> {
    show_dashboard_inner(&app)
}

#[tauri::command]
fn hide_dashboard(app: AppHandle) -> Result<(), String> {
    hide_dashboard_inner(&app)
}

pub(crate) fn hide_dashboard_inner(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Err("Dashboard window not found".into());
    };
    let _ = window.hide();
    #[cfg(target_os = "windows")]
    {
        force_hide_window(&window);
    }
    Ok(())
}

/// Windows often rejects SetForegroundWindow after an async invoke.
/// Attach thread input to the current foreground window and force activation.
#[cfg(target_os = "windows")]
fn force_foreground_window(window: &tauri::WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow,
        ShowWindow, SW_RESTORE, SW_SHOW,
    };

    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let hwnd = HWND(hwnd.0);

    unsafe {
        let _ = ShowWindow(hwnd, SW_RESTORE);
        let _ = ShowWindow(hwnd, SW_SHOW);

        let foreground = GetForegroundWindow();
        if foreground == hwnd {
            let _ = BringWindowToTop(hwnd);
            return;
        }

        let fg_thread = GetWindowThreadProcessId(foreground, None);
        let target_thread = GetWindowThreadProcessId(hwnd, None);
        let current = GetCurrentThreadId();

        let attached_fg = fg_thread != 0
            && fg_thread != current
            && AttachThreadInput(current, fg_thread, true).as_bool();
        let attached_target = target_thread != 0
            && target_thread != current
            && target_thread != fg_thread
            && AttachThreadInput(current, target_thread, true).as_bool();

        let _ = BringWindowToTop(hwnd);
        let _ = SetForegroundWindow(hwnd);
        let _ = ShowWindow(hwnd, SW_SHOW);

        if attached_target {
            let _ = AttachThreadInput(current, target_thread, false);
        }
        if attached_fg {
            let _ = AttachThreadInput(current, fg_thread, false);
        }
    }
}

#[cfg(target_os = "windows")]
fn force_hide_window(window: &tauri::WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_HIDE};

    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    unsafe {
        let _ = ShowWindow(HWND(hwnd.0), SW_HIDE);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Two instances = two widgets fighting (flicker / wrong size / z-order war).
    if !single_instance::try_acquire() {
        eprintln!("IA Usage is already running — exiting duplicate instance.");
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_merged_usage,
            import_cursor_csv,
            auto_import_cursor_csv,
            show_dashboard,
            hide_dashboard
        ])
        .setup(|app| {
            // Launch with Windows so the widget is always available.
            autostart::ensure_autostart();

            // Widget follows Cursor / Claude windows (bottom-right of that window).
            // Hide the legacy WebView widget — native layered mascot replaces it.
            if let Some(widget) = app.get_webview_window("widget") {
                let _ = widget.hide();
            }
            if let Err(e) = native_mascot::create(app.handle().clone()) {
                eprintln!("native mascot failed: {e}");
            }
            cursor_anchor::start_host_follow(app.handle().clone());

            if let Some(main) = app.get_webview_window("main") {
                let main_for_close = main.clone();
                main.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // Keep the process alive (mascot stays) — just dismiss the dashboard.
                        api.prevent_close();
                        let _ = main_for_close.hide();
                        #[cfg(target_os = "windows")]
                        force_hide_window(&main_for_close);
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
