#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod capture;
mod workspace;

use tauri::{Emitter, Manager};

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
            workspace::recovery::load_drafts,
            workspace::recovery::save_draft,
            workspace::recovery::clear_draft,
            workspace::images::save_image,
            workspace::images::read_image,
            workspace::create_note,
            workspace::editing::create_named_note,
            workspace::editing::move_snapshot,
            workspace::editing::move_note,
            workspace::revisions::list_versions,
            workspace::revisions::read_version,
            workspace::inbox::capture_note,
            workspace::inbox::list_inbox,
            workspace::inbox::read_inbox,
            workspace::inbox::process_inbox,
            workspace::inbox::undo_inbox,
            workspace::trash::list_trash,
            workspace::trash::trash_note,
            workspace::trash::restore_note,
            workspace::trash::delete_trashed_note,
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
        .expect("could not start rightmark")
        .run(|_app, event| {
            if let tauri::RunEvent::ExitRequested {
                code: None, api, ..
            } = &event
            {
                if _app.get_webview_window("main").is_some() {
                    api.prevent_exit();
                    let _ = _app.emit_to("main", "folio-quit", ());
                }
            }
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
