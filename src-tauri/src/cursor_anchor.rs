//! Glue the floating widget to the bottom-right of Cursor IDE / Claude Desktop windows.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition};
use windows::core::{BOOL, PWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetForegroundWindow, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId,
    IsIconic, IsWindowVisible,
};

const WIDGET_W: f64 = 56.0;
const WIDGET_H: f64 = 56.0;
const MARGIN: i32 = 10;

#[derive(Clone, Copy, Debug)]
pub struct AnchorRect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl AnchorRect {
    fn width(self) -> i32 {
        (self.right - self.left).max(0)
    }

    fn height(self) -> i32 {
        (self.bottom - self.top).max(0)
    }

    fn area(self) -> i64 {
        self.width() as i64 * self.height() as i64
    }

    fn widget_pos(self) -> (i32, i32) {
        let x = self.right - 56 - MARGIN;
        let y = self.bottom - 56 - MARGIN;
        (x.max(self.left), y.max(self.top))
    }
}

struct EnumState {
    targets: Vec<(HWND, AnchorRect, bool)>,
    foreground: HWND,
}

fn is_target_process(exe_name: &str) -> bool {
    matches!(
        exe_name.to_ascii_lowercase().as_str(),
        "cursor.exe" | "claude.exe"
    )
}

unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let state = &mut *(lparam.0 as *mut EnumState);

    if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
        return BOOL(1);
    }

    let mut rect = RECT::default();
    if GetWindowRect(hwnd, &mut rect).is_err() {
        return BOOL(1);
    }
    let w = rect.right - rect.left;
    let h = rect.bottom - rect.top;
    if w < 280 || h < 280 {
        return BOOL(1);
    }

    let mut title_buf = [0u16; 256];
    let title_len = GetWindowTextW(hwnd, &mut title_buf);
    let title = String::from_utf16_lossy(&title_buf[..title_len as usize]);
    if title.is_empty() {
        return BOOL(1);
    }
    if title.contains("IA Usage") || title.contains("Clawd Usage") || title == "Clawd" {
        return BOOL(1);
    }

    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid == 0 {
        return BOOL(1);
    }

    let Some(name) = process_base_name(pid) else {
        return BOOL(1);
    };
    if !is_target_process(&name) {
        return BOOL(1);
    }

    let is_fg = hwnd == state.foreground;
    state.targets.push((
        hwnd,
        AnchorRect {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
        },
        is_fg,
    ));

    BOOL(1)
}

fn process_base_name(pid: u32) -> Option<String> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 520];
        let mut size = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buf.as_mut_ptr()),
            &mut size,
        )
        .is_ok();
        let _ = windows::Win32::Foundation::CloseHandle(handle);
        if !ok || size == 0 {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..size as usize]);
        Some(
            path.rsplit(['\\', '/'])
                .next()
                .unwrap_or(path.as_str())
                .to_string(),
        )
    }
}

/// Foreground Cursor/Claude window if any, else the largest visible one.
pub fn find_host_anchor() -> Option<AnchorRect> {
    unsafe {
        let foreground = GetForegroundWindow();
        let mut state = EnumState {
            targets: Vec::new(),
            foreground,
        };
        let _ = EnumWindows(
            Some(enum_callback),
            LPARAM(&mut state as *mut EnumState as isize),
        );

        if state.targets.is_empty() {
            return None;
        }

        if let Some((_, rect, _)) = state.targets.iter().find(|(_, _, fg)| *fg) {
            return Some(*rect);
        }

        state
            .targets
            .into_iter()
            .max_by_key(|(_, r, _)| r.area())
            .map(|(_, r, _)| r)
    }
}

pub fn start_host_follow(app: AppHandle) {
    let running = Arc::new(AtomicBool::new(true));
    let flag = running.clone();
    std::mem::forget(running);

    thread::spawn(move || {
        let mut last_pos: Option<(i32, i32)> = None;
        let mut last_visible: Option<bool> = None;
        let mut sized = false;

        while flag.load(Ordering::Relaxed) {
            let Some(widget) = app.get_webview_window("widget") else {
                thread::sleep(Duration::from_millis(400));
                continue;
            };

            if !sized {
                let _ = widget.set_size(LogicalSize::new(WIDGET_W, WIDGET_H));
                sized = true;
            }

            match find_host_anchor() {
                Some(rect) => {
                    let (x, y) = rect.widget_pos();
                    if last_visible != Some(true) {
                        let _ = widget.show();
                        last_visible = Some(true);
                    }
                    if last_pos != Some((x, y)) {
                        let _ = widget.set_position(PhysicalPosition::new(x, y));
                        last_pos = Some((x, y));
                    }
                }
                None => {
                    if last_visible != Some(false) {
                        let _ = widget.hide();
                        last_visible = Some(false);
                        last_pos = None;
                    }
                }
            }

            thread::sleep(Duration::from_millis(120));
        }
    });
}
