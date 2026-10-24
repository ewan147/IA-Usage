//! Native layered Win32 mascot — no WebView2 (avoids white plate / wrong page bugs).

use std::sync::OnceLock;
use std::thread;

use image::ImageReader;
use tauri::AppHandle;
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, SIZE, WPARAM};
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, GetMonitorInfoW,
    MonitorFromRect, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    HBITMAP, HGDIOBJ, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, GetWindowLongPtrW, LoadCursorW, PostQuitMessage,
    RegisterClassExW, SetWindowLongPtrW, SetWindowPos, ShowWindow, CS_HREDRAW, CS_VREDRAW,
    GWLP_USERDATA, HMENU, HWND_TOPMOST, HTCLIENT, IDC_HAND, SWP_NOACTIVATE, SWP_NOSENDCHANGING,
    SWP_SHOWWINDOW, SW_HIDE, SW_SHOWNOACTIVATE, WM_DESTROY, WM_LBUTTONUP, WM_NCHITTEST,
    WNDCLASSEXW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
};

const SPARKLES_PNG: &[u8] = include_bytes!("../../src/assets/clawd/transparent/sparkles.png");
const CLASS_NAME: PCWSTR = w!("IAUsageClawdMascot");

pub const MIN_SIZE: i32 = 28;
pub const MAX_SIZE: i32 = 72;
pub const DEFAULT_SIZE: i32 = 56;

static APP: OnceLock<AppHandle> = OnceLock::new();
static MASCOT_HWND: OnceLock<isize> = OnceLock::new();

struct MascotState {
    dib: HBITMAP,
    mem_dc: windows::Win32::Graphics::Gdi::HDC,
    width: i32,
    height: i32,
    src_rgba: Vec<u8>,
    src_w: u32,
    src_h: u32,
}

unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_NCHITTEST => LRESULT(HTCLIENT as isize),
        WM_LBUTTONUP => {
            if let Some(app) = APP.get() {
                let app = app.clone();
                thread::spawn(move || {
                    let _ = crate::show_dashboard_inner(&app);
                });
            }
            LRESULT(0)
        }
        WM_DESTROY => {
            let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA);
            if ptr != 0 {
                let state = Box::from_raw(ptr as *mut MascotState);
                let _ = SelectObject(state.mem_dc, HGDIOBJ(std::ptr::null_mut()));
                let _ = DeleteObject(HGDIOBJ(state.dib.0));
                let _ = DeleteDC(state.mem_dc);
            }
            PostQuitMessage(0);
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

fn decode_source_rgba() -> Result<(Vec<u8>, u32, u32), String> {
    let img = ImageReader::new(std::io::Cursor::new(SPARKLES_PNG))
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| e.to_string())?
        .into_rgba8();
    let (w, h) = img.dimensions();
    Ok((img.into_raw(), w, h))
}

fn scale_premultiplied_bgra(src: &[u8], src_w: u32, src_h: u32, size: i32) -> Vec<u8> {
    let rgba = image::RgbaImage::from_raw(src_w, src_h, src.to_vec())
        .expect("rgba buffer size matches dimensions");
    let resized = image::imageops::resize(
        &rgba,
        size as u32,
        size as u32,
        image::imageops::FilterType::CatmullRom,
    );
    let mut bgra = Vec::with_capacity((size * size * 4) as usize);
    for pixel in resized.pixels() {
        let [r, g, b, a] = pixel.0;
        let pr = (r as u16 * a as u16 / 255) as u8;
        let pg = (g as u16 * a as u16 / 255) as u8;
        let pb = (b as u16 * a as u16 / 255) as u8;
        bgra.extend_from_slice(&[pb, pg, pr, a]);
    }
    bgra
}

unsafe fn rebuild_dib(state: &mut MascotState, size: i32) -> Result<(), String> {
    let size = size.clamp(MIN_SIZE, MAX_SIZE);
    if state.width == size && state.height == size && !state.dib.0.is_null() {
        return Ok(());
    }

    let bgra = scale_premultiplied_bgra(&state.src_rgba, state.src_w, state.src_h, size);

    let _ = SelectObject(state.mem_dc, HGDIOBJ(std::ptr::null_mut()));
    if !state.dib.0.is_null() {
        let _ = DeleteObject(HGDIOBJ(state.dib.0));
        state.dib = HBITMAP(std::ptr::null_mut());
    }

    let bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: size,
            biHeight: -size,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0 as u32,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut bits: *mut std::ffi::c_void = std::ptr::null_mut();
    let dib = CreateDIBSection(Some(state.mem_dc), &bmi, DIB_RGB_COLORS, &mut bits, None, 0)
        .map_err(|e| e.to_string())?;
    if !bits.is_null() {
        std::ptr::copy_nonoverlapping(bgra.as_ptr(), bits as *mut u8, bgra.len());
    }
    let _ = SelectObject(state.mem_dc, HGDIOBJ(dib.0));
    state.dib = dib;
    state.width = size;
    state.height = size;
    Ok(())
}

pub fn create(app: AppHandle) -> Result<HWND, String> {
    let _ = APP.set(app);

    let (src_rgba, src_w, src_h) = decode_source_rgba()?;
    let size = DEFAULT_SIZE;
    let bgra = scale_premultiplied_bgra(&src_rgba, src_w, src_h, size);

    unsafe {
        let hinstance = windows::Win32::System::LibraryLoader::GetModuleHandleW(None)
            .map_err(|e| e.to_string())?;

        let wc = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(wnd_proc),
            hInstance: hinstance.into(),
            hCursor: LoadCursorW(None, IDC_HAND).unwrap_or_default(),
            lpszClassName: CLASS_NAME,
            ..Default::default()
        };
        let _ = RegisterClassExW(&wc);

        let hwnd = CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            CLASS_NAME,
            w!("Clawd"),
            WS_POPUP,
            0,
            0,
            size,
            size,
            None,
            None::<HMENU>,
            Some(hinstance.into()),
            None,
        )
        .map_err(|e| e.to_string())?;

        let screen_dc = GetDC(None);
        let mem_dc = CreateCompatibleDC(Some(screen_dc));
        let bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: size,
                biHeight: -size,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0 as u32,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bits: *mut std::ffi::c_void = std::ptr::null_mut();
        let dib = CreateDIBSection(Some(mem_dc), &bmi, DIB_RGB_COLORS, &mut bits, None, 0)
            .map_err(|e| e.to_string())?;
        if !bits.is_null() {
            std::ptr::copy_nonoverlapping(bgra.as_ptr(), bits as *mut u8, bgra.len());
        }
        let _ = SelectObject(mem_dc, HGDIOBJ(dib.0));
        let _ = ReleaseDC(None, screen_dc);

        let state = Box::new(MascotState {
            dib,
            mem_dc,
            width: size,
            height: size,
            src_rgba,
            src_w,
            src_h,
        });
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, Box::into_raw(state) as isize);

        paint_layered(hwnd)?;
        let _ = ShowWindow(hwnd, SW_HIDE);

        let _ = MASCOT_HWND.set(hwnd.0 as isize);
        Ok(hwnd)
    }
}

fn paint_layered(hwnd: HWND) -> Result<(), String> {
    unsafe {
        let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA);
        if ptr == 0 {
            return Err("no mascot state".into());
        }
        let state = &*(ptr as *const MascotState);

        let pt_src = POINT { x: 0, y: 0 };
        let size = SIZE {
            cx: state.width,
            cy: state.height,
        };
        let mut pt_dst = POINT { x: 0, y: 0 };
        let mut rect = RECT::default();
        let _ = windows::Win32::UI::WindowsAndMessaging::GetWindowRect(hwnd, &mut rect);
        pt_dst.x = rect.left;
        pt_dst.y = rect.top;

        let blend = windows::Win32::Graphics::Gdi::BLENDFUNCTION {
            BlendOp: windows::Win32::Graphics::Gdi::AC_SRC_OVER as u8,
            BlendFlags: 0,
            SourceConstantAlpha: 255,
            AlphaFormat: windows::Win32::Graphics::Gdi::AC_SRC_ALPHA as u8,
        };

        let screen_dc = GetDC(None);
        let ok = windows::Win32::UI::WindowsAndMessaging::UpdateLayeredWindow(
            hwnd,
            Some(screen_dc),
            Some(&pt_dst),
            Some(&size),
            Some(state.mem_dc),
            Some(&pt_src),
            COLORREF(0),
            Some(&blend),
            windows::Win32::UI::WindowsAndMessaging::ULW_ALPHA,
        );
        let _ = ReleaseDC(None, screen_dc);
        if ok.is_err() {
            return Err("UpdateLayeredWindow failed".into());
        }
        Ok(())
    }
}

pub fn hwnd() -> Option<HWND> {
    MASCOT_HWND
        .get()
        .map(|v| HWND(*v as *mut std::ffi::c_void))
}

pub fn set_visible(show: bool) {
    let Some(hwnd) = hwnd() else {
        return;
    };
    unsafe {
        let _ = ShowWindow(hwnd, if show { SW_SHOWNOACTIVATE } else { SW_HIDE });
    }
}

fn monitor_work_area(x: i32, y: i32, w: i32, h: i32) -> RECT {
    unsafe {
        let probe = RECT {
            left: x,
            top: y,
            right: x + w.max(1),
            bottom: y + h.max(1),
        };
        let mon = MonitorFromRect(&probe, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(mon, &mut info).as_bool() {
            info.rcWork
        } else {
            RECT {
                left: 0,
                top: 0,
                right: 1920,
                bottom: 1080,
            }
        }
    }
}

/// Place + optionally resize the mascot in one shot (physical pixels).
pub fn place(x: i32, y: i32, size: i32) {
    let Some(hwnd) = hwnd() else {
        return;
    };
    unsafe {
        let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA);
        if ptr == 0 {
            return;
        }
        let state = &mut *(ptr as *mut MascotState);
        let size = size.clamp(MIN_SIZE, MAX_SIZE);
        if rebuild_dib(state, size).is_err() {
            return;
        }

        let w = state.width;
        let h = state.height;
        let work = monitor_work_area(x, y, w, h);
        let max_x = work.right - w - 4;
        let max_y = work.bottom - h - 4;
        let x = x.clamp(work.left, max_x.max(work.left));
        let y = y.clamp(work.top, max_y.max(work.top));

        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            x,
            y,
            w,
            h,
            SWP_NOACTIVATE | SWP_NOSENDCHANGING | SWP_SHOWWINDOW,
        );
        let _ = paint_layered(hwnd);
    }
}

pub fn move_to(x: i32, y: i32) {
    place(x, y, current_size());
}

pub fn current_size() -> i32 {
    let Some(hwnd) = hwnd() else {
        return DEFAULT_SIZE;
    };
    unsafe {
        let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA);
        if ptr == 0 {
            return DEFAULT_SIZE;
        }
        let state = &*(ptr as *const MascotState);
        state.width
    }
}

pub fn size_px() -> i32 {
    current_size()
}
