//! Glue the floating mascot to the bottom-right of Cursor IDE / Claude Desktop windows.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use tauri::AppHandle;
use windows::core::{BOOL, PWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetAncestor, GetForegroundWindow, GetWindowRect, GetWindowTextW,
    GetWindowThreadProcessId, IsIconic, IsWindowVisible, GA_ROOT,
};

use crate::native_mascot;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
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

    /// Size scales with the host window: shrink when Cursor/Claude is small.
    fn widget_size(self) -> i32 {
        let min_side = self.width().min(self.height()).max(1) as f32;
        // ~6% of the shorter side — readable on large windows, discreet on small ones.
        let raw = (min_side * 0.06).round() as i32;
        // Snap to even px so tiny resize jitter doesn't thrash the bitmap.
        let snapped = (raw / 2) * 2;
        snapped.clamp(native_mascot::MIN_SIZE, native_mascot::MAX_SIZE)
    }

    fn margin(self, size: i32) -> i32 {
        let min_side = self.width().min(self.height()).max(1) as f32;
        let m = (min_side * 0.018).round() as i32;
        // Keep a bit of air relative to widget size.
        m.clamp(6, (size / 3).max(8))
    }

    /// Bottom-right of the *visible* frame, clamped inside the host.
    fn widget_placement(self) -> (i32, i32, i32) {
        let size = self.widget_size();
        let margin = self.margin(size);
        let x = self.right - size - margin;
        let y = self.bottom - size - margin;
        let x = x.clamp(self.left + 4, (self.right - size - 4).max(self.left + 4));
        let y = y.clamp(self.top + 4, (self.bottom - size - 4).max(self.top + 4));
        (x, y, size)
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

fn is_self_process(exe_name: &str) -> bool {
    matches!(
        exe_name.to_ascii_lowercase().as_str(),
        "ia-usage.exe" | "clawd-usage.exe"
    )
}

/// Prefer DWM visible frame (ignores invisible Win10/11 resize borders).
fn visible_window_rect(hwnd: HWND) -> Option<AnchorRect> {
    unsafe {
        let mut dwm = RECT::default();
        let ok = DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut dwm as *mut _ as *mut _,
            std::mem::size_of::<RECT>() as u32,
        )
        .is_ok();
        if ok && dwm.right > dwm.left && dwm.bottom > dwm.top {
            return Some(AnchorRect {
                left: dwm.left,
                top: dwm.top,
                right: dwm.right,
                bottom: dwm.bottom,
            });
        }

        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return None;
        }
        if rect.right <= rect.left || rect.bottom <= rect.top {
            return None;
        }
        Some(AnchorRect {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
        })
    }
}

fn root_window(hwnd: HWND) -> HWND {
    let root = unsafe { GetAncestor(hwnd, GA_ROOT) };
    if root.0.is_null() {
        hwnd
    } else {
        root
    }
}

unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let state = &mut *(lparam.0 as *mut EnumState);

    // Top-level only (skip tool windows / owned popups we don't want as anchors).
    if root_window(hwnd) != hwnd {
        return BOOL(1);
    }

    if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
        return BOOL(1);
    }

    let Some(rect) = visible_window_rect(hwnd) else {
        return BOOL(1);
    };
    // Ignore tiny chrome / splash / toast windows.
    if rect.width() < 320 || rect.height() < 240 {
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

    let is_fg = hwnd == state.foreground || hwnd == root_window(state.foreground);
    state.targets.push((hwnd, rect, is_fg));

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

fn collect_host_targets(foreground: HWND) -> Vec<(HWND, AnchorRect, bool)> {
    unsafe {
        let mut state = EnumState {
            targets: Vec::new(),
            foreground: root_window(foreground),
        };
        let _ = EnumWindows(
            Some(enum_callback),
            LPARAM(&mut state as *mut EnumState as isize),
        );
        state.targets
    }
}

fn pick_best_anchor(targets: &[(HWND, AnchorRect, bool)], foreground: HWND) -> Option<AnchorRect> {
    if targets.is_empty() {
        return None;
    }
    let fg_root = root_window(foreground);
    if let Some((_, rect, _)) = targets.iter().find(|(hwnd, _, _)| *hwnd == fg_root) {
        return Some(*rect);
    }
    if let Some((_, rect, _)) = targets.iter().find(|(_, _, fg)| *fg) {
        return Some(*rect);
    }
    // Prefer the largest reasonable host (main IDE over tiny satellite windows).
    targets
        .iter()
        .max_by_key(|(_, r, _)| r.area())
        .map(|(_, r, _)| *r)
}

#[derive(Clone, Copy, Debug)]
enum HostFollow {
    Active(AnchorRect),
    SelfFocused,
    Hide,
}

fn resolve_host_follow() -> HostFollow {
    unsafe {
        let foreground = GetForegroundWindow();
        if foreground.0.is_null() {
            return HostFollow::Hide;
        }

        let mut fg_pid = 0u32;
        GetWindowThreadProcessId(foreground, Some(&mut fg_pid));
        if fg_pid == 0 {
            return HostFollow::Hide;
        }
        let Some(fg_name) = process_base_name(fg_pid) else {
            return HostFollow::Hide;
        };

        if is_self_process(&fg_name) {
            return HostFollow::SelfFocused;
        }

        if !is_target_process(&fg_name) {
            return HostFollow::Hide;
        }

        let targets = collect_host_targets(foreground);
        match pick_best_anchor(&targets, foreground) {
            Some(rect) => HostFollow::Active(rect),
            None => HostFollow::Hide,
        }
    }
}

pub fn start_host_follow(_app: AppHandle) {
    let running = Arc::new(AtomicBool::new(true));
    let flag = running.clone();
    std::mem::forget(running);

    thread::spawn(move || {
        let mut last_place: Option<(i32, i32, i32)> = None;
        let mut last_visible: Option<bool> = None;
        let mut last_anchor: Option<AnchorRect> = None;

        while flag.load(Ordering::Relaxed) {
            let show_at = match resolve_host_follow() {
                HostFollow::Active(rect) => {
                    last_anchor = Some(rect);
                    Some(rect.widget_placement())
                }
                HostFollow::SelfFocused => last_anchor.map(|r| r.widget_placement()),
                HostFollow::Hide => None,
            };

            match show_at {
                Some((x, y, size)) => {
                    let place = (x, y, size);
                    if last_visible != Some(true) || last_place != Some(place) {
                        native_mascot::place(x, y, size);
                        native_mascot::set_visible(true);
                        last_place = Some(place);
                        last_visible = Some(true);
                    }
                }
                None => {
                    if last_visible != Some(false) {
                        native_mascot::set_visible(false);
                        last_visible = Some(false);
                        last_place = None;
                    }
                }
            }

            // Snappy enough to track maximize / drag without eating CPU.
            thread::sleep(Duration::from_millis(80));
        }
    });
}
