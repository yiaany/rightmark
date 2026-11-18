use serde::Serialize;
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, PhysicalPosition, State,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const DEFAULT: &str = "Control+Shift+N";

#[derive(Clone, Serialize)]
pub struct ShortcutStatus {
    shortcut: String,
    error: Option<String>,
}

pub struct Capture {
    settings: PathBuf,
    shortcut: Mutex<ShortcutStatus>,
    previous: Mutex<Option<i32>>,
}

pub fn setup(app: &AppHandle, data: PathBuf) -> tauri::Result<()> {
    let settings = data.join("capture-shortcut.txt");
    let shortcut = fs::read_to_string(&settings)
        .ok()
        .filter(|key| valid_shortcut(key))
        .unwrap_or_else(|| DEFAULT.into());
    let error = register(app, &shortcut).err();
    app.manage(Capture {
        shortcut: Mutex::new(ShortcutStatus { shortcut, error }),
        settings,
        previous: Mutex::new(None),
    });

    let show = MenuItem::with_id(app, "folio-show", "Open Folio", true, None::<&str>)?;
    let note = MenuItem::with_id(app, "folio-capture", "Quick Capture", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "folio-quit", "Quit Folio", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&note, &show, &quit])?;
    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Folio")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "folio-capture" => {
                let _ = open_capture(app.clone());
            }
            "folio-show" => show_main(app),
            "folio-quit" => {
                let _ = app.emit_to("main", "folio-quit", ());
            }
            _ => (),
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn register(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _, event| {
            if event.state == ShortcutState::Pressed {
                let _ = open_capture(app.clone());
            }
        })
        .map_err(|_| "This shortcut is unavailable. Choose another combination in Settings.".into())
}

fn valid_shortcut(value: &str) -> bool {
    let parts: Vec<_> = value.split('+').collect();
    let Some((key, modifiers)) = parts.split_last() else {
        return false;
    };
    key.len() == 1
        && key
            .bytes()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
        && modifiers.len() >= 2
        && modifiers
            .iter()
            .any(|key| matches!(*key, "Control" | "Command" | "Alt"))
        && modifiers.iter().enumerate().all(|(i, key)| {
            matches!(*key, "Control" | "Command" | "Alt" | "Shift") && !modifiers[..i].contains(key)
        })
}

#[tauri::command]
pub fn capture_shortcut(state: State<'_, Capture>) -> Result<ShortcutStatus, String> {
    Ok(state
        .shortcut
        .lock()
        .map_err(|_| "Shortcut settings are unavailable.")?
        .clone())
}

#[tauri::command]
pub async fn set_capture_shortcut(
    app: AppHandle,
    shortcut: String,
) -> Result<ShortcutStatus, String> {
    if !valid_shortcut(&shortcut) {
        return Err("Use at least two modifiers and a letter or number.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Capture>();
        let mut current = state
            .shortcut
            .lock()
            .map_err(|_| "Shortcut settings are unavailable.")?;
        if current.shortcut == shortcut && current.error.is_none() {
            return Ok(current.clone());
        }
        register(&app, &shortcut)?;
        if let Err(error) = fs::write(&state.settings, &shortcut) {
            let _ = app.global_shortcut().unregister(shortcut.as_str());
            return Err(error.to_string());
        }
        if current.error.is_none() {
            let _ = app.global_shortcut().unregister(current.shortcut.as_str());
        }
        *current = ShortcutStatus {
            shortcut,
            error: None,
        };
        Ok(current.clone())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn open_capture(app: AppHandle) -> Result<(), String> {
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let Some(window) = handle.get_webview_window("capture") else {
            return;
        };
        if !window.is_visible().unwrap_or(false) {
            if let Ok(mut previous) = handle.state::<Capture>().previous.lock() {
                *previous = frontmost();
            }
            if let Ok(cursor) = handle.cursor_position() {
                if let (Ok(Some(monitor)), Ok(size)) = (
                    handle.monitor_from_point(cursor.x, cursor.y),
                    window.outer_size(),
                ) {
                    let area = monitor.work_area();
                    let _ = window.set_position(PhysicalPosition::new(
                        area.position.x + (area.size.width.saturating_sub(size.width) / 2) as i32,
                        area.position.y + (area.size.height.saturating_sub(size.height) / 4) as i32,
                    ));
                }
            }
        }
        let _ = window.show();
        let _ = window.set_focus();
    })
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn hide_capture(app: AppHandle) -> Result<(), String> {
    let handle = app.clone();
    app.run_on_main_thread(move || dismiss(&handle))
        .map_err(|error| error.to_string())
}

pub fn dismiss(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("capture") {
        let focused = window.is_focused().unwrap_or(false);
        let _ = window.hide();
        let previous = app
            .state::<Capture>()
            .previous
            .lock()
            .ok()
            .and_then(|mut previous| previous.take());
        if focused {
            if let Some(pid) = previous {
                restore(pid);
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn frontmost() -> Option<i32> {
    objc2_app_kit::NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .map(|app| app.processIdentifier())
        .filter(|pid| *pid != std::process::id() as i32)
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn restore(pid: i32) {
    use objc2::runtime::NSObjectProtocol;
    use objc2::{sel, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSApplicationActivationOptions, NSRunningApplication};
    if let Some(previous) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid) {
        if previous.isActive() {
            return;
        }
        if let Some(main) = MainThreadMarker::new() {
            let app = NSApplication::sharedApplication(main);
            // On macOS 14 and later, hand activation back cooperatively.
            if app.isActive() && app.respondsToSelector(sel!(yieldActivationToApplication:)) {
                app.yieldActivationToApplication(&previous);
            }
        }
        let _ =
            previous.activateWithOptions(NSApplicationActivationOptions::ActivateIgnoringOtherApps);
    }
}

#[cfg(not(target_os = "macos"))]
fn frontmost() -> Option<i32> {
    None
}

#[cfg(not(target_os = "macos"))]
fn restore(_: i32) {}

#[tauri::command]
pub fn quit_folio(app: AppHandle) {
    app.exit(0);
}
