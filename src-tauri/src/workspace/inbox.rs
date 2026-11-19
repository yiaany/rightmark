use super::*;
use serde::Deserialize;
use tauri::Emitter;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxNote {
    #[serde(flatten)]
    note: NoteInfo,
    local: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Action {
    Move { folder: String },
    Append { target: String },
    Task,
    Archive,
}

pub(super) struct Receipt {
    key: String,
    origin: PathBuf,
    source: String,
    original: String,
    destination: String,
    before: Option<String>,
    after: String,
}

fn inbox_path(root: &Path, path: &str) -> Result<PathBuf, String> {
    let Some(name) = path.strip_prefix("Inbox/") else {
        return Err("Select a note in Inbox.".into());
    };
    if name.contains('/') || name.contains('\\') {
        return Err("Select a note in Inbox.".into());
    }
    note_path(root, path)
}

fn directory(root: &Path, folder: &str, create: bool) -> Result<PathBuf, String> {
    let relative = Path::new(folder);
    if !relative.components().all(
        |part| matches!(part, Component::Normal(name) if !name.to_string_lossy().starts_with('.')),
    ) {
        return Err("Invalid destination folder.".into());
    }
    let path = root.join(relative);
    if create {
        match fs::create_dir(&path) {
            Ok(()) => (),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => (),
            Err(error) => return Err(message(error)),
        }
    }
    if !path.is_dir() || path.canonicalize().map_err(message)? != path {
        return Err("This folder is not available in the workspace.".into());
    }
    Ok(path)
}

fn stem(text: &str) -> String {
    let title: String = text
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("")
        .trim()
        .trim_start_matches(['#', '-', '>', '*', ' '])
        .chars()
        .filter(|c| !c.is_control())
        .map(|c| if "/\\:*?\"<>|".contains(c) { ' ' } else { c })
        .scan(0, |bytes, c| {
            *bytes += c.len_utf8();
            (*bytes <= 120).then_some(c)
        })
        .collect();
    let normalized = title.split_whitespace().collect::<Vec<_>>().join(" ");
    let title = normalized.trim_matches([' ', '.']);
    if title.is_empty() {
        "Quick note".into()
    } else {
        title.into()
    }
}

fn new_file(root: &Path, folder: &Path, stem: &str, text: &str) -> Result<NoteInfo, String> {
    if text.len() as u64 > MAX_NOTE_BYTES {
        return Err("This note is larger than 4 MB.".into());
    }
    let mut temp = tempfile::NamedTempFile::new_in(folder).map_err(message)?;
    temp.write_all(text.as_bytes()).map_err(message)?;
    temp.as_file().sync_all().map_err(message)?;
    for i in 1..=10_000 {
        let name = if i == 1 {
            format!("{stem}.md")
        } else {
            format!("{stem} {i}.md")
        };
        let path = folder.join(name);
        match temp.persist_noclobber(&path) {
            Ok(_) => return note_info(root, &path).map_err(message),
            Err(error) if error.error.kind() == io::ErrorKind::AlreadyExists => temp = error.file,
            Err(error) => return Err(message(error.error)),
        }
    }
    Err("Could not find an unused note name.".into())
}

fn scan(root: &Path, local: bool) -> Result<Vec<InboxNote>, String> {
    let path = root.join("Inbox");
    if !path.exists() {
        return Ok(vec![]);
    }
    let dir = directory(root, "Inbox", false)?;
    Ok(fs::read_dir(dir)
        .map_err(message)?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry.file_type().is_ok_and(|kind| kind.is_file())
                && markdown(&entry.path())
                && !entry.file_name().to_string_lossy().starts_with('.')
        })
        .filter_map(|entry| note_info(root, &entry.path()).ok())
        .map(|note| InboxNote { note, local })
        .collect())
}

fn stored_root(store: &Store, key: &str, local: bool) -> Result<PathBuf, String> {
    let root = store.active_root(key)?;
    Ok(if local { store.sample.clone() } else { root })
}

#[tauri::command]
pub async fn capture_note(app: AppHandle, text: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if text.trim().is_empty() {
            return Err("Write something before saving.".into());
        }
        let store = app.state::<Store>();
        let _guard = store.writes.lock().map_err(message)?;
        let active = store.root.lock().map_err(message)?;
        let folder = directory(&active, "Inbox", true)?;
        new_file(&active, &folder, &stem(&text), &text)?;
        let _ = app.emit_to("main", "folio-inbox-changed", ());
        Ok(())
    })
    .await
    .map_err(message)?
}

#[tauri::command]
pub async fn list_inbox(app: AppHandle, key: String) -> Result<Vec<InboxNote>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let root = store.active_root(&key)?;
        let mut notes = scan(&root, false)?;
        if root != store.sample {
            notes.extend(scan(&store.sample, true)?);
        }
        Ok(notes)
    })
    .await
    .map_err(message)?
}

#[tauri::command]
pub async fn read_inbox(
    app: AppHandle,
    key: String,
    path: String,
    local: bool,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = stored_root(&app.state::<Store>(), &key, local)?;
        read_text(&inbox_path(&root, &path)?).map_err(message)
    })
    .await
    .map_err(message)?
}

fn make_task(text: &str) -> String {
    let text = text.trim_start();
    let (first, rest) = text.split_once('\n').unwrap_or((text, ""));
    let first = first.trim();
    let label = ["- [ ] ", "- [x] ", "- [X] "]
        .iter()
        .find_map(|prefix| first.strip_prefix(prefix))
        .unwrap_or(first);
    if rest.is_empty() {
        format!("- [ ] {label}\n")
    } else {
        format!("- [ ] {label}\n\n{rest}")
    }
}

fn process(
    data: &Path,
    root: &Path,
    origin: &Path,
    key: String,
    path: String,
    expected: String,
    action: Action,
) -> Result<Receipt, String> {
    let source = inbox_path(origin, &path)?;
    let original = read_text(&source).map_err(message)?;
    if original != expected {
        return Err("This Inbox note changed. Select it again to see the latest version.".into());
    }
    let name = stem(&original);
    let mut before = None;
    let mut after = original.clone();
    let destination = match action {
        Action::Append { target } => {
            if target.starts_with("Inbox/") {
                return Err("Choose a note outside Inbox.".into());
            }
            let to = note_path(root, &target)?;
            let previous = read_text(&to).map_err(message)?;
            let newline = if previous.contains("\r\n") {
                "\r\n"
            } else {
                "\n"
            };
            let separator = if previous.is_empty() || previous.ends_with(&newline.repeat(2)) {
                "".into()
            } else if previous.ends_with(newline) {
                newline.into()
            } else {
                newline.repeat(2)
            };
            after = format!(
                "{previous}{separator}{}",
                original.trim_start_matches(['\r', '\n'])
            );
            if after != previous {
                revisions::snapshot(data, root, &target, &previous)?;
                replace_note(&to, &after, &previous)?;
            }
            before = Some(previous);
            target
        }
        Action::Move { folder } => {
            if folder == "Inbox" || folder.starts_with("Inbox/") {
                return Err("Choose a folder outside Inbox.".into());
            }
            new_file(root, &directory(root, &folder, false)?, &name, &after)?.path
        }
        Action::Archive => new_file(root, &directory(root, "Archive", true)?, &name, &after)?.path,
        Action::Task => {
            after = make_task(&original);
            new_file(root, root, &name, &after)?.path
        }
    };
    let receipt = Receipt {
        key,
        origin: origin.to_owned(),
        source: path,
        original,
        destination,
        before,
        after,
    };
    let remove = (|| {
        if read_text(&source).map_err(message)? != receipt.original {
            return Err("The original note changed while processing it.".into());
        }
        fs::remove_file(&source).map_err(message)
    })();
    if let Err(error) = remove {
        return match revert_destination(root, &receipt) {
            Ok(()) => Err(error),
            Err(_) => Err(format!("{error} Check both Inbox and the destination: the original was not removed by rightmark.")),
        };
    }
    Ok(receipt)
}

fn revert_destination(root: &Path, receipt: &Receipt) -> Result<(), String> {
    let path = note_path(root, &receipt.destination)?;
    if let Some(before) = &receipt.before {
        return replace_note(&path, before, &receipt.after);
    }
    if read_text(&path).map_err(message)? != receipt.after {
        return Err("The destination note changed. Nothing was undone.".into());
    }
    fs::remove_file(path).map_err(message)
}

#[tauri::command]
pub async fn process_inbox(
    app: AppHandle,
    key: String,
    path: String,
    local: bool,
    expected: String,
    action: Action,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let _guard = store.writes.lock().map_err(message)?;
        let root = store.lock_root(&key)?;
        let origin = if local { &store.sample } else { &*root };
        let mut undo = store.undo_inbox.lock().map_err(message)?;
        let receipt = process(&store.data, &root, origin, key, path, expected, action)?;
        let destination = receipt.destination.clone();
        *undo = Some(receipt);
        Ok(destination)
    })
    .await
    .map_err(message)?
}

#[tauri::command]
pub async fn undo_inbox(app: AppHandle, key: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let _guard = store.writes.lock().map_err(message)?;
        let root = store.lock_root(&key)?;
        let mut undo = store.undo_inbox.lock().map_err(message)?;
        let receipt = undo
            .as_ref()
            .filter(|receipt| receipt.key == key)
            .ok_or("Nothing to undo in this workspace.")?;
        if receipt.before.is_some() {
            let dest = note_path(&root, &receipt.destination)?;
            if read_text(&dest).map_err(message)? != receipt.after {
                return Err("The destination note changed. Nothing was undone.".into());
            }
            revisions::snapshot(&store.data, &root, &receipt.destination, &receipt.after)?;
        }
        let folder = directory(&receipt.origin, "Inbox", true)?;
        let path = folder.join(receipt.source.rsplit('/').next().unwrap_or_default());
        let mut temp = tempfile::NamedTempFile::new_in(folder).map_err(message)?;
        temp.write_all(receipt.original.as_bytes())
            .map_err(message)?;
        temp.as_file().sync_all().map_err(message)?;
        temp.persist_noclobber(&path).map_err(message)?;
        if let Err(error) = revert_destination(&root, receipt) {
            let _ = fs::remove_file(path);
            return Err(error);
        }
        Ok(undo.take().expect("receipt exists").destination)
    })
    .await
    .map_err(message)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn process_append_preserves_source_content_and_reverts_exactly() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let inbox = directory(&root, "Inbox", true).unwrap();
        let source = new_file(&root, &inbox, "Idea", "A thought\nA detail").unwrap();
        let target = root.join("Notes.md");
        fs::write(&target, "Existing\r\n").unwrap();
        let receipt = process(
            &root.join(".test-data"),
            &root,
            &root,
            "test".into(),
            source.path.clone(),
            "A thought\nA detail".into(),
            Action::Append {
                target: "Notes.md".into(),
            },
        )
        .unwrap();
        assert!(!root.join(&source.path).exists());
        assert_eq!(
            read_text(&target).unwrap(),
            "Existing\r\n\r\nA thought\nA detail"
        );
        revert_destination(&root, &receipt).unwrap();
        assert_eq!(read_text(&target).unwrap(), "Existing\r\n");
        assert_eq!(receipt.original, "A thought\nA detail");
    }

    #[test]
    fn capture_does_not_overwrite_or_follow_external_inbox() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let inbox = directory(&root, "Inbox", true).unwrap();
        let first = new_file(&root, &inbox, "Idea", "First").unwrap();
        let second = new_file(&root, &inbox, "Idea", "Second").unwrap();
        assert_ne!(first.path, second.path);
        assert_eq!(read_text(&root.join(first.path)).unwrap(), "First");
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&inbox, root.join("Alias")).unwrap();
            assert!(directory(&root, "Alias", false).is_err());
        }
    }
}
