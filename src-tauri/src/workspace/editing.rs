use super::*;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

fn destination(root: &Path, relative: &str, create: bool) -> Result<PathBuf, String> {
    if relative
        .split('/')
        .any(|part| part.is_empty() || part == "." || part == ".." || part.contains('\\'))
    {
        return Err("Enter a path inside the workspace.".into());
    }
    validate_note_path(Path::new(relative))?;
    let dest = workspace_path(root, relative);
    let mut parent = root.to_owned();
    for segment in relative
        .rsplit_once('/')
        .map(|(folder, _)| folder)
        .into_iter()
        .flat_map(|folder| folder.split('/'))
    {
        parent.push(segment);
        if create {
            match fs::create_dir(&parent) {
                Ok(()) => (),
                Err(err) if err.kind() == io::ErrorKind::AlreadyExists => (),
                Err(err) => return Err(message(err)),
            }
        }
        if !parent.symlink_metadata().map_err(message)?.is_dir()
            || parent.canonicalize().map_err(message)? != parent
        {
            return Err("Choose a regular folder inside the workspace.".into());
        }
    }
    Ok(dest)
}

fn stage(
    path: &Path,
    text: &str,
    permissions: Option<fs::Permissions>,
) -> Result<tempfile::NamedTempFile, String> {
    if text.len() as u64 > MAX_NOTE_BYTES {
        return Err("This note is larger than 4 MB.".into());
    }
    let mut file = tempfile::NamedTempFile::new_in(path.parent().ok_or("Invalid note path.")?)
        .map_err(message)?;
    if let Some(permissions) = permissions {
        file.as_file()
            .set_permissions(permissions)
            .map_err(message)?;
    }
    file.write_all(text.as_bytes()).map_err(message)?;
    file.as_file().sync_all().map_err(message)?;
    Ok(file)
}

#[derive(Serialize, Deserialize)]
pub struct FileText {
    path: String,
    text: String,
}

#[derive(Serialize)]
pub struct MoveSnapshot {
    revision: String,
    files: Vec<FileText>,
}

fn scan(root: &Path) -> Result<MoveSnapshot, String> {
    let mut files = Vec::new();
    for entry in WalkDir::new(root)
        .min_depth(1)
        .sort_by_file_name()
        .into_iter()
        .filter_entry(|entry| !entry.file_name().to_string_lossy().starts_with('.'))
    {
        let entry = entry.map_err(message)?;
        if !entry.file_type().is_file() || !markdown(entry.path()) {
            continue;
        }
        let path = note_info(root, entry.path()).map_err(message)?.path;
        let file = note_path(root, &path)?;
        let text =
            read_text(&file).map_err(|err| format!("Could not check links in {path}: {err}"))?;
        files.push(FileText { path, text });
    }
    let mut hash = Sha256::new();
    for file in &files {
        for value in [&file.path, &file.text] {
            hash.update((value.len() as u64).to_le_bytes());
            hash.update(value.as_bytes());
        }
    }
    Ok(MoveSnapshot {
        revision: format!("{:x}", hash.finalize()),
        files,
    })
}

#[derive(Deserialize)]
pub struct MovePlan {
    source: String,
    destination: String,
    revision: String,
    changes: Vec<FileText>,
}

#[derive(Serialize)]
pub struct MoveResult {
    warning: Option<String>,
}

fn commit_move(data: &Path, root: &Path, plan: MovePlan) -> Result<MoveResult, String> {
    let snapshot = scan(root)?;
    if snapshot.revision != plan.revision {
        return Err("The workspace changed. Try again to recalculate its links.".into());
    }
    if plan.source == plan.destination {
        return Err("Choose a different name or folder.".into());
    }
    let originals = snapshot
        .files
        .into_iter()
        .map(|file| (file.path, file.text))
        .collect::<BTreeMap<_, _>>();
    let source_text = originals
        .get(&plan.source)
        .ok_or("The original note is no longer available.")?;
    let source = note_path(root, &plan.source)?;
    let target = destination(root, &plan.destination, true)?;
    if !matches!(target.symlink_metadata(), Err(err) if err.kind() == io::ErrorKind::NotFound) {
        return Err("A file or folder already exists at the destination.".into());
    }
    let permissions = fs::metadata(&source).map_err(message)?.permissions();
    let mut moved_text = source_text.as_str();
    let mut seen = BTreeSet::new();
    let mut staged = Vec::new();
    for change in &plan.changes {
        let before = originals
            .get(&change.path)
            .ok_or("A linked note no longer exists.")?;
        if !seen.insert(&change.path) {
            return Err("Duplicate linked note in move plan.".into());
        }
        if change.path == plan.source {
            moved_text = &change.text;
        } else if before != &change.text {
            let file = note_path(root, &change.path)?;
            let mode = fs::metadata(&file).map_err(message)?.permissions();
            let temp = stage(&file, &change.text, Some(mode))?;
            staged.push((change, before, temp));
        }
    }
    let new_file = stage(&target, moved_text, Some(permissions))?;
    // Retain the original text even if a later step fails or the app is interrupted.
    for (change, before, _) in &staged {
        revisions::snapshot(data, root, &change.path, before)?;
    }
    revisions::snapshot(data, root, &plan.source, source_text)?;
    new_file.persist_noclobber(&target).map_err(message)?;
    let mut written = Vec::new();
    let result: Result<(), String> = (|| {
        for (change, before, temp) in staged {
            let file = note_path(root, &change.path)?;
            if read_text(&file).map_err(message)? != *before {
                return Err(format!("{} changed outside rightmark.", change.path));
            }
            temp.persist(&file).map_err(message)?;
            written.push((change, before));
        }
        if read_text(&note_path(root, &plan.source)?).map_err(message)? != *source_text {
            return Err("The original note changed outside rightmark.".into());
        }
        fs::remove_file(&source).map_err(message)
    })();
    if let Err(error) = result {
        let mut clean = true;
        for (change, before) in written.into_iter().rev() {
            clean &= note_path(root, &change.path)
                .and_then(|path| replace_note(&path, before, &change.text))
                .is_ok();
        }
        // If any linked note could not be rolled back, keep the destination as recovery.
        clean = clean
            && note_path(root, &plan.destination).is_ok_and(|path| {
                read_text(&path).is_ok_and(|text| text == moved_text)
                    && fs::remove_file(path).is_ok()
            });
        return Err(if clean {
            error
        } else {
            format!("{error} Some files could not be rolled back; check both paths and Version history.")
        });
    }
    let warning = revisions::transfer(data, root, &plan.source, &plan.destination)
        .err()
        .map(|err| format!("Note moved, but some version history could not be transferred: {err}"));
    Ok(MoveResult { warning })
}

#[tauri::command]
pub async fn create_named_note(
    app: AppHandle,
    key: String,
    path: String,
    text: String,
    open_existing: bool,
) -> Result<NoteInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let _writes = store.writes.lock().map_err(message)?;
        let root = store.lock_root(&key)?;
        let file = destination(&root, &path, true)?;
        let temp = stage(&file, &text, None)?;
        match temp.persist_noclobber(&file) {
            Ok(_) => note_info(&root, &file).map_err(message),
            Err(error) if error.error.kind() == io::ErrorKind::AlreadyExists && open_existing => {
                note_info(&root, &note_path(&root, &path)?).map_err(message)
            }
            Err(error) if error.error.kind() == io::ErrorKind::AlreadyExists => {
                Err("A note already exists at that path.".into())
            }
            Err(error) => Err(message(error)),
        }
    })
    .await
    .map_err(message)?
}

#[tauri::command]
pub async fn move_snapshot(app: AppHandle, key: String) -> Result<MoveSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let _writes = store.writes.lock().map_err(message)?;
        let root = store.lock_root(&key)?;
        scan(&root)
    })
    .await
    .map_err(message)?
}

#[tauri::command]
pub async fn move_note(app: AppHandle, key: String, plan: MovePlan) -> Result<MoveResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let _writes = store.writes.lock().map_err(message)?;
        let root = store.lock_root(&key)?;
        commit_move(&store.data, &root, plan)
    })
    .await
    .map_err(message)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn move_preflights_conflicts_without_touching_linked_files() {
        let folder = tempfile::tempdir().unwrap();
        let root = folder.path().canonicalize().unwrap();
        let data = root.join(".data");
        fs::write(root.join("A.md"), "Original\r\n").unwrap();
        fs::write(root.join("B.md"), "[[A]]\r\n").unwrap();
        let plan = |revision, destination: &str| MovePlan {
            source: "A.md".into(),
            destination: destination.into(),
            revision,
            changes: vec![FileText {
                path: "B.md".into(),
                text: "[[Moved]]\r\n".into(),
            }],
        };
        let revision = scan(&root).unwrap().revision;
        fs::write(root.join("B.md"), "External change").unwrap();
        assert!(commit_move(&data, &root, plan(revision, "New/A.md")).is_err());
        assert_eq!(read_text(&root.join("B.md")).unwrap(), "External change");
        assert!(!root.join("New/A.md").exists());
        let revision = scan(&root).unwrap().revision;
        assert!(commit_move(&data, &root, plan(revision.clone(), "B.md")).is_err());
        assert_eq!(read_text(&root.join("A.md")).unwrap(), "Original\r\n");
        assert!(commit_move(&data, &root, plan(revision, "New/Moved.md"))
            .unwrap()
            .warning
            .is_none());
        assert!(!root.join("A.md").exists());
        assert_eq!(
            read_text(&root.join("New/Moved.md")).unwrap(),
            "Original\r\n"
        );
        assert_eq!(read_text(&root.join("B.md")).unwrap(), "[[Moved]]\r\n");
    }

    #[cfg(unix)]
    #[test]
    fn destination_does_not_traverse_symlinks_or_hidden_folders() {
        let folder = tempfile::tempdir().unwrap();
        let root = folder.path().canonicalize().unwrap();
        let external = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(external.path(), root.join("Shortcut")).unwrap();
        assert!(destination(&root, "Shortcut/New/Note.md", true).is_err());
        assert!(!external.path().join("New").exists());
        assert!(destination(&root, ".rightmark-trash/Note.md", true).is_err());
        assert!(destination(&root, "Notes/../Note.md", true).is_err());
    }
}
