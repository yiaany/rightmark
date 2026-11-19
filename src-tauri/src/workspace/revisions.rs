use super::*;
use sha2::{Digest, Sha256};
use std::time::SystemTime;

const LIMIT: usize = 30;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    id: String,
    saved_at: u64,
}

fn bucket(data: &Path, root: &Path, path: &str) -> PathBuf {
    let mut hash = Sha256::new();
    hash.update(root.to_string_lossy().as_bytes());
    hash.update([0]);
    hash.update(path.as_bytes());
    data.join("history-v1")
        .join(format!("{:x}", hash.finalize()))
}

fn millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn version(id: &str) -> Option<Version> {
    let (time, suffix) = id.strip_suffix(".md")?.split_once('-')?;
    if suffix.is_empty() || !suffix.bytes().all(|c| c.is_ascii_alphanumeric()) {
        return None;
    }
    Some(Version {
        id: id.to_owned(),
        saved_at: time.parse().ok()?,
    })
}

fn list(dir: &Path) -> Result<Vec<Version>, String> {
    let items = match fs::read_dir(dir) {
        Ok(items) => items,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(vec![]),
        Err(error) => return Err(message(error)),
    };
    let mut result = items
        .filter_map(Result::ok)
        .filter(|item| item.file_type().is_ok_and(|kind| kind.is_file()))
        .filter_map(|item| version(item.file_name().to_str()?))
        .collect::<Vec<_>>();
    result.sort_by(|a, b| b.saved_at.cmp(&a.saved_at).then(b.id.cmp(&a.id)));
    Ok(result)
}

pub(super) fn snapshot(data: &Path, root: &Path, path: &str, text: &str) -> Result<(), String> {
    let dir = bucket(data, root, path);
    fs::create_dir_all(&dir).map_err(message)?;
    if let Some(last) = list(&dir)?.first() {
        if read_text(&dir.join(&last.id)).is_ok_and(|latest| latest == text) {
            return Ok(());
        }
    }
    let prefix = format!(".{}-", millis());
    let mut file = tempfile::Builder::new()
        .prefix(&prefix)
        .suffix(".md")
        .tempfile_in(&dir)
        .map_err(message)?;
    file.write_all(text.as_bytes()).map_err(message)?;
    file.as_file().sync_all().map_err(message)?;
    let id = file
        .path()
        .file_name()
        .and_then(|name| name.to_str())
        .and_then(|name| name.strip_prefix('.'))
        .ok_or("Invalid version filename.")?;
    let published = dir.join(id);
    file.persist_noclobber(published).map_err(message)?;
    for item in list(&dir)?.iter().skip(LIMIT) {
        let _ = fs::remove_file(dir.join(&item.id));
    }
    Ok(())
}

pub(super) fn replace(
    store: &Store,
    root: &Path,
    relative: &str,
    file: &Path,
    text: &str,
    expected: &str,
) -> Result<(), String> {
    if text.len() as u64 > MAX_NOTE_BYTES {
        return Err("This note is larger than 4 MB.".into());
    }
    let current = read_text(file).map_err(message)?;
    if current != expected {
        return Err(
            "This file changed outside rightmark. Copy your edits before reopening it.".into(),
        );
    }
    if text != current {
        snapshot(&store.data, root, relative, &current)
            .map_err(|error| format!("Could not save the previous version: {error}"))?;
        replace_note(file, text, &current)?;
    }
    Ok(())
}

pub(super) fn transfer(
    data: &Path,
    root: &Path,
    source: &str,
    destination: &str,
) -> Result<(), String> {
    let from = bucket(data, root, source);
    let to = bucket(data, root, destination);
    if !from.exists() {
        return Ok(());
    }
    if !to.exists() {
        return fs::rename(from, to).map_err(message);
    }
    // A previous note used this path. Preserve both histories instead of overwriting.
    for item in list(&from)? {
        let old = from.join(&item.id);
        let new = to.join(&item.id);
        match fs::hard_link(&old, &new) {
            Ok(()) => fs::remove_file(old).map_err(message)?,
            Err(error)
                if error.kind() == io::ErrorKind::AlreadyExists
                    && read_text(&old).ok() == read_text(&new).ok() =>
            {
                fs::remove_file(old).map_err(message)?
            }
            Err(error) => return Err(message(error)),
        }
    }
    let _ = fs::remove_dir(from);
    for item in list(&to)?.iter().skip(LIMIT) {
        let _ = fs::remove_file(to.join(&item.id));
    }
    Ok(())
}

#[tauri::command]
pub async fn list_versions(
    app: AppHandle,
    key: String,
    path: String,
) -> Result<Vec<Version>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let _writes = store.writes.lock().map_err(message)?;
        let root = store.lock_root(&key)?;
        note_path(&root, &path)?;
        list(&bucket(&store.data, &root, &path))
    })
    .await
    .map_err(message)?
}

#[tauri::command]
pub async fn read_version(
    app: AppHandle,
    key: String,
    path: String,
    id: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let _writes = store.writes.lock().map_err(message)?;
        let root = store.lock_root(&key)?;
        note_path(&root, &path)?;
        version(&id).ok_or("Invalid version.")?;
        let file = bucket(&store.data, &root, &path).join(id);
        if !file.symlink_metadata().map_err(message)?.is_file() {
            return Err("This version is unavailable.".into());
        }
        read_text(&file).map_err(message)
    })
    .await
    .map_err(message)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn previous_versions_are_deduplicated_bounded_and_move_with_the_note() {
        let folder = tempfile::tempdir().unwrap();
        let root = folder.path().canonicalize().unwrap();
        let data = root.join(".data");
        snapshot(&data, &root, "Test.md", "First\r\n").unwrap();
        snapshot(&data, &root, "Test.md", "First\r\n").unwrap();
        let before = bucket(&data, &root, "Test.md");
        let entries = list(&before).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(
            read_text(&before.join(&entries[0].id)).unwrap(),
            "First\r\n"
        );
        for count in 0..35 {
            snapshot(&data, &root, "Test.md", &count.to_string()).unwrap();
        }
        transfer(&data, &root, "Test.md", "New/Test.md").unwrap();
        assert!(!before.exists());
        assert_eq!(
            list(&bucket(&data, &root, "New/Test.md")).unwrap().len(),
            LIMIT
        );
    }
}
