#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod capture;
mod workspace;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            app.manage(workspace::Store::new(data.clone())?);
            capture::setup(app.handle(), data)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspace::get_workspace,
            workspace::open_workspace,
            workspace::list_notes,
            workspace::read_note,
            workspace::write_note,
            workspace::create_note,
            workspace::inbox::capture_note,
            workspace::inbox::list_inbox,
            workspace::inbox::read_inbox,
            workspace::inbox::process_inbox,
            workspace::inbox::undo_inbox,
            capture::open_capture,
            capture::hide_capture,
            capture::capture_shortcut,
            capture::set_capture_shortcut,
            capture::quit_folio,
        ])
        .on_window_event(|window, event| {
            if window.label() == "capture" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    capture::dismiss(window.app_handle());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("could not start Folio")
        .run(|_app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen {
                has_visible_windows: false,
                ..
            } = event
            {
                capture::show_main(_app);
            }
        });
}
