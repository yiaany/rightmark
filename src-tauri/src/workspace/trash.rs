use super::*;

const FOLDER: &str = ".rightmark-trash";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    id: String,
    path: String,
    deleted_at: u64,
}

fn checked_directory(path: &Path, create: bool) -> Result<PathBuf, String> {
    if create {
        match fs::create_dir(path) {
            Ok(()) => (),
            Err(err) if err.kind() == io::ErrorKind::AlreadyExists => (),
            Err(err) => return Err(message(err)),
        }
    }
    let metadata = path.symlink_metadata().map_err(message)?;
    if !metadata.is_dir() || path.canonicalize().map_err(message)? != path {
        return Err("This folder is not a regular workspace folder.".into());
    }
    Ok(path.to_owned())
}

fn trash_dir(root: &Path, create: bool) -> Result<Option<PathBuf>, String> {
    let path = root.join(FOLDER);
    if !create
        && matches!(path.symlink_metadata(), Err(err) if err.kind() == io::ErrorKind::NotFound)
    {
        return Ok(None);
    }
    checked_directory(&path, create).map(Some)
}

fn entry(dir: &Path, id: &str) -> Result<TrashItem, String> {
    if !id.starts_with("note-")
        || id.len() <= 5
        || !id[5..].bytes().all(|c| c.is_ascii_alphanumeric())
    {
        return Err("Invalid Trash entry.".into());
    }
    let base = checked_directory(&dir.join(id), false)?;
    let mut files = WalkDir::new(&base)
        .min_depth(1)
        .into_iter()
        .filter_entry(|item| !item.file_name().to_string_lossy().starts_with('.'));
    let mut found = None;
    for item in &mut files {
        let item = item.map_err(message)?;
        if item.file_type().is_file() && markdown(item.path()) {
            if found.is_some() {
                return Err("This Trash entry contains more than one note.".into());
            }
            found = Some(note_info(&base, item.path()).map_err(message)?.path);
        }
    }
    let path = found.ok_or("This note is no longer in Trash.")?;
    let deleted_at = fs::metadata(&base)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |time| time.as_millis() as u64);
    Ok(TrashItem {
        id: id.to_owned(),
        path,
        deleted_at,
    })
}

fn move_to_trash(root: &Path, path: &str, expected: Option<&str>) -> Result<(), String> {
    let source = note_path(root, path)?;
    if let Some(text) = expected {
        if read_text(&source).map_err(message)? != text {
            return Err(
                "This file changed outside rightmark. Reopen it before moving it to Trash.".into(),
            );
        }
    }
    let dir = trash_dir(root, true)?.ok_or("Trash is unavailable.")?;
    let item = tempfile::Builder::new()
        .prefix("note-")
        .tempdir_in(dir)
        .map_err(message)?;
    let dest = workspace_path(item.path(), path);
    fs::create_dir_all(dest.parent().ok_or("Invalid note path.")?).map_err(message)?;
    fs::rename(&source, &dest).map_err(message)?;
    // From this point the item owns the only copy. Persist it, rather than cleaning up.
    let _ = item.keep();
    Ok(())
}

fn cleanup(base: &Path, file: &Path) {
    let mut parent = file.parent();
    while let Some(dir) = parent {
        let _ = fs::remove_dir(dir);
        if dir == base {
            break;
        }
        parent = dir.parent();
    }
}

fn restore(root: &Path, dir: &Path, id: &str) -> Result<String, String> {
    let TrashItem { path, .. } = entry(dir, id)?;
    let base = dir.join(id);
    let source = note_path(&base, &path)?;
    let dest = workspace_path(root, &path);
    let mut parent = root.to_owned();
    for component in Path::new(&path)
        .parent()
        .ok_or("Invalid restore path.")?
        .components()
    {
        let Component::Normal(segment) = component else {
            return Err("Invalid restore path.".into());
        };
        parent = checked_directory(&parent.join(segment), true)?;
    }
    // Both locations are on the same volume. Hard-link creation fails atomically if the old name is occupied.
    fs::hard_link(&source, &dest).map_err(|err| {
        if err.kind() == io::ErrorKind::AlreadyExists {
            "A file already exists at the original location. Move or rename it first.".into()
        } else {
            message(err)
        }
    })?;
    if let Err(err) = fs::remove_file(&source) {
        return Err(format!(
            "The note was restored, but the Trash copy could not be removed: {err}"
        ));
    }
    cleanup(&base, &source);
    Ok(path)
}

#[tauri::command]
pub async fn list_trash(app: AppHandle, key: String) -> Result<Vec<TrashItem>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let _writes = store.writes.lock().map_err(message)?;
        let root = store.lock_root(&key)?;
        let Some(dir) = trash_dir(&root, false)? else {
            return Ok(vec![]);
        };
        let mut items = fs::read_dir(&dir)
            .map_err(message)?
            .filter_map(Result::ok)
            .filter_map(|item| entry(&dir, item.file_name().to_str()?).ok())
            .collect::<Vec<_>>();
        items.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at).then(a.path.cmp(&b.path)));
        Ok(items)
    })
    .await
    .map_err(message)?
}

#[tauri::command]
pub async fn trash_note(
    app: AppHandle,
    key: String,
    path: String,
    expected: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let _writes = store.writes.lock().map_err(message)?;
        let root = store.lock_root(&key)?;
        move_to_trash(&root, &path, expected.as_deref())
    })
    .await
    .map_err(message)?
}

#[tauri::command]
pub async fn restore_note(app: AppHandle, key: String, id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let _writes = store.writes.lock().map_err(message)?;
        let root = store.lock_root(&key)?;
        let dir = trash_dir(&root, false)?.ok_or("Trash is empty.")?;
        restore(&root, &dir, &id)
    })
    .await
    .map_err(message)?
}

#[tauri::command]
pub async fn delete_trashed_note(app: AppHandle, key: String, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let _writes = store.writes.lock().map_err(message)?;
        let root = store.lock_root(&key)?;
        let dir = trash_dir(&root, false)?.ok_or("Trash is empty.")?;
        let item = entry(&dir, &id)?;
        let base = dir.join(id);
        let source = note_path(&base, &item.path)?;
        fs::remove_file(&source).map_err(message)?;
        cleanup(&base, &source);
        Ok(())
    })
    .await
    .map_err(message)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restores_nested_note_without_overwriting_another_file() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().canonicalize().unwrap();
        let path = "Notes/Example.md";
        fs::create_dir(root.join("Notes")).unwrap();
        fs::write(root.join(path), "Original\r\n").unwrap();
        assert!(move_to_trash(&root, path, Some("Stale")).is_err());
        move_to_trash(&root, path, Some("Original\r\n")).unwrap();
        assert!(!root.join(path).exists());
        let dir = trash_dir(&root, false).unwrap().unwrap();
        let id = fs::read_dir(&dir)
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .file_name()
            .into_string()
            .unwrap();
        assert_eq!(entry(&dir, &id).unwrap().path, path);
        fs::write(root.join(path), "Replacement").unwrap();
        assert!(restore(&root, &dir, &id).is_err());
        assert_eq!(fs::read_to_string(root.join(path)).unwrap(), "Replacement");
        fs::remove_file(root.join(path)).unwrap();
        fs::remove_dir(root.join("Notes")).unwrap();
        assert_eq!(restore(&root, &dir, &id).unwrap(), path);
        assert_eq!(fs::read_to_string(root.join(path)).unwrap(), "Original\r\n");
        assert!(fs::read_dir(dir).unwrap().next().is_none());
    }
}
