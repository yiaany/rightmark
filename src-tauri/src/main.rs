#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod workspace;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            app.manage(workspace::Store::new(data)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspace::get_workspace,
            workspace::open_workspace,
            workspace::list_notes,
            workspace::read_note,
            workspace::write_note,
            workspace::create_note,
        ])
        .run(tauri::generate_context!())
        .expect("could not start Folio");
}
