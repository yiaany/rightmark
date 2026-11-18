use serde::Serialize;
use std::{
    fs,
    io::{self, Read, Write},
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::UNIX_EPOCH,
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use walkdir::WalkDir;

const MAX_NOTE_BYTES: u64 = 4 * 1024 * 1024;
const SAMPLE: &[(&str, &str)] = &[
    ("Start here.md", include_str!("../../sample/Start here.md")),
    ("Scratchpad.md", include_str!("../../sample/Scratchpad.md")),
    (
        "Field Notes/Studio refresh.md",
        include_str!("../../sample/Field Notes/Studio refresh.md"),
    ),
    (
        "Field Notes/Walk through the studio.md",
        include_str!("../../sample/Field Notes/Walk through the studio.md"),
    ),
    (
        "Field Notes/Reading list.md",
        include_str!("../../sample/Field Notes/Reading list.md"),
    ),
    (
        "Reference/Light and color.md",
        include_str!("../../sample/Reference/Light and color.md"),
    ),
];

pub struct Store {
    data: PathBuf,
    sample: PathBuf,
    root: Mutex<PathBuf>,
    writes: Mutex<()>,
}

#[derive(Serialize)]
pub struct WorkspaceInfo {
    key: String,
    name: String,
    sample: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInfo {
    path: String,
    modified_at: u64,
}

impl Store {
    pub fn new(data: PathBuf) -> io::Result<Self> {
        fs::create_dir_all(&data)?;
        let sample = data.join("Sample workspace");
        if !sample.exists() {
            for (relative, text) in SAMPLE {
                let path = sample.join(relative);
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::write(path, text)?;
            }
        }
        let sample = sample.canonicalize()?;
        let root = fs::read_to_string(data.join("workspace.txt"))
            .ok()
            .and_then(|path| PathBuf::from(path).canonicalize().ok())
            .filter(|path| path.is_dir() && path.to_str().is_some())
            .unwrap_or_else(|| sample.clone());
        Ok(Self {
            data,
            root: Mutex::new(root),
            sample,
            writes: Mutex::new(()),
        })
    }

    fn info(&self, root: &Path) -> WorkspaceInfo {
        WorkspaceInfo {
            key: root.to_string_lossy().into_owned(),
            name: root
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("Workspace")
                .to_owned(),
            sample: root == self.sample,
        }
    }

    fn active_root(&self, key: &str) -> Result<PathBuf, String> {
        let root = self.root.lock().map_err(|_| "Workspace is unavailable.")?;
        if root.to_str() != Some(key) {
            return Err("The selected workspace changed.".into());
        }
        Ok(root.clone())
    }
}

#[tauri::command]
pub fn get_workspace(store: State<'_, Store>) -> Result<WorkspaceInfo, String> {
    let root = store.root.lock().map_err(|_| "Workspace is unavailable.")?;
    Ok(store.info(&root))
}

#[tauri::command]
pub async fn open_workspace(app: AppHandle) -> Result<Option<WorkspaceInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(selected) = app
            .dialog()
            .file()
            .set_title("Open Markdown Folder")
            .blocking_pick_folder()
        else {
            return Ok(None);
        };
        let root = selected
            .into_path()
            .map_err(message)?
            .canonicalize()
            .map_err(message)?;
        let key = root
            .to_str()
            .ok_or("This folder path is not valid UTF-8.")?;
        let store = app.state::<Store>();
        let mut active = store.root.lock().map_err(|_| "Workspace is unavailable.")?;
        fs::write(store.data.join("workspace.txt"), key).map_err(message)?;
        let info = store.info(&root);
        *active = root;
        Ok(Some(info))
    })
    .await
    .map_err(message)?
}

#[tauri::command]
pub async fn list_notes(app: AppHandle, key: String) -> Result<Vec<NoteInfo>, String> {
    let root = app.state::<Store>().active_root(&key)?;
    tauri::async_runtime::spawn_blocking(move || {
        if !root.is_dir() {
            return Err("The workspace folder could not be found.".into());
        }
        let notes = WalkDir::new(&root)
            .min_depth(1)
            .into_iter()
            .filter_entry(|entry| !entry.file_name().to_string_lossy().starts_with('.'))
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_file() && markdown(entry.path()))
            .filter_map(|entry| note_info(&root, entry.path()).ok())
            .collect();
        Ok(notes)
    })
    .await
    .map_err(message)?
}

#[tauri::command]
pub async fn read_note(app: AppHandle, key: String, path: String) -> Result<String, String> {
    let root = app.state::<Store>().active_root(&key)?;
    tauri::async_runtime::spawn_blocking(move || {
        let path = note_path(&root, &path)?;
        read_text(&path).map_err(message)
    })
    .await
    .map_err(message)?
}

#[tauri::command]
pub async fn write_note(
    app: AppHandle,
    key: String,
    path: String,
    text: String,
    expected: String,
) -> Result<(), String> {
    let root = app.state::<Store>().active_root(&key)?;
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let _guard = store
            .writes
            .lock()
            .map_err(|_| "File storage is unavailable.")?;
        let path = note_path(&root, &path)?;
        replace_note(&path, &text, &expected)
    })
    .await
    .map_err(message)?
}

#[tauri::command]
pub async fn create_note(app: AppHandle, key: String) -> Result<NoteInfo, String> {
    let root = app.state::<Store>().active_root(&key)?;
    tauri::async_runtime::spawn_blocking(move || {
        for index in 1..=10_000 {
            let file = if index == 1 {
                "Untitled.md".to_owned()
            } else {
                format!("Untitled {index}.md")
            };
            let path = root.join(file);
            match fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)
            {
                Ok(_) => return note_info(&root, &path).map_err(message),
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(message(error)),
            }
        }
        Err("Could not find an unused note name.".into())
    })
    .await
    .map_err(message)?
}

fn note_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative);
    if !markdown(relative) || !relative.components().all(|part| matches!(part, Component::Normal(name) if !name.to_string_lossy().starts_with('.'))) {
        return Err("Invalid Markdown file path.".into());
    }
    let path = root.join(relative);
    let resolved = path.canonicalize().map_err(message)?;
    if path != resolved || !resolved.starts_with(root) || !resolved.is_file() {
        return Err("This note is outside the workspace or is a symbolic link.".into());
    }
    Ok(path)
}

fn markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
}

fn note_info(root: &Path, path: &Path) -> io::Result<NoteInfo> {
    let path_string = path
        .strip_prefix(root)
        .ok()
        .and_then(Path::to_str)
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "Invalid workspace path"))?;
    let modified_at = fs::metadata(path)?
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |duration| duration.as_millis() as u64);
    Ok(NoteInfo {
        path: path_string.to_owned(),
        modified_at,
    })
}

fn read_text(path: &Path) -> io::Result<String> {
    let mut text = String::new();
    fs::File::open(path)?
        .take(MAX_NOTE_BYTES + 1)
        .read_to_string(&mut text)?;
    if text.len() as u64 > MAX_NOTE_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "This note is larger than 4 MB.",
        ));
    }
    Ok(text)
}

fn replace_note(path: &Path, text: &str, expected: &str) -> Result<(), String> {
    if text.len() as u64 > MAX_NOTE_BYTES {
        return Err("This note is larger than 4 MB.".into());
    }
    let parent = path.parent().ok_or("This note has no parent folder.")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(message)?;
    temp.as_file()
        .set_permissions(fs::metadata(path).map_err(message)?.permissions())
        .map_err(message)?;
    temp.write_all(text.as_bytes()).map_err(message)?;
    temp.as_file().sync_all().map_err(message)?;
    if read_text(path).map_err(message)? != expected {
        return Err("This file changed outside Folio. Copy your edits before reopening it.".into());
    }
    temp.persist(path).map_err(message)?;
    Ok(())
}

fn message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn note_replacement_preserves_external_changes() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("note.md");
        fs::write(&path, "Old\r\n").unwrap();
        replace_note(&path, "New\n", "Old\r\n").unwrap();
        assert!(replace_note(&path, "Overwritten", "Old\r\n").is_err());
        assert_eq!(read_text(&path).unwrap(), "New\n");
    }

    #[test]
    fn note_path_rejects_traversal_and_symlinks() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().canonicalize().unwrap();
        let note = root.join("note.md");
        fs::write(&note, "Note").unwrap();
        assert_eq!(note_path(&root, "note.md").unwrap(), note);
        assert!(note_path(&root, "../note.md").is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&note, root.join("linked.md")).unwrap();
            assert!(note_path(&root, "linked.md").is_err());
        }
    }
}
