use super::*;
use serde::Deserialize;
use sha2::{Digest, Sha256};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub path: String,
    pub text: String,
    pub base: String,
    pub saved_at: u64,
}

fn folder(store: &Store, key: &str) -> PathBuf {
    store
        .data
        .join("drafts-v1")
        .join(format!("{:x}", Sha256::digest(key.as_bytes())))
}

fn entry(dir: &Path, path: &str) -> Result<PathBuf, String> {
    validate_note_path(Path::new(path))?;
    Ok(dir.join(format!("{:x}.json", Sha256::digest(path.as_bytes()))))
}

fn store_draft(dir: &Path, draft: &Draft) -> Result<(), String> {
    let entry = entry(dir, &draft.path)?;
    // Leave room for recovering an oversized edit that the Markdown writer rejected.
    if draft.text.len() as u64 > MAX_NOTE_BYTES * 4 || draft.base.len() as u64 > MAX_NOTE_BYTES {
        return Err("The recovery draft exceeds 16 MB.".into());
    }
    fs::create_dir_all(dir).map_err(message)?;
    let mut temp = tempfile::NamedTempFile::new_in(dir).map_err(message)?;
    serde_json::to_writer(temp.as_file_mut(), draft).map_err(message)?;
    temp.as_file().sync_all().map_err(message)?;
    temp.persist(entry).map_err(message)?;
    Ok(())
}

fn read_draft(path: &Path) -> Option<Draft> {
    let meta = path.symlink_metadata().ok()?;
    if !meta.is_file() || meta.len() > MAX_NOTE_BYTES * 31 {
        return None;
    }
    serde_json::from_reader(fs::File::open(path).ok()?).ok()
}

#[tauri::command]
pub async fn load_drafts(app: AppHandle, key: String) -> Result<Vec<Draft>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let _root = store.lock_root(&key)?;
        let dir = folder(&store, &key);
        match fs::read_dir(&dir) {
            Ok(rows) => Ok(rows
                .flatten()
                .filter_map(|row| {
                    let path = row.path();
                    if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                        return None;
                    }
                    let draft = read_draft(&path)?;
                    (entry(&dir, &draft.path).ok()? == path).then_some(draft)
                })
                .collect()),
            Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(Vec::new()),
            Err(err) => Err(message(err)),
        }
    })
    .await
    .map_err(message)?
}

#[tauri::command]
pub async fn save_draft(app: AppHandle, key: String, draft: Draft) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let _root = store.lock_root(&key)?;
        let dir = folder(&store, &key);
        let path = entry(&dir, &draft.path)?;
        if read_draft(&path).is_some_and(|old| old.saved_at > draft.saved_at) {
            return Ok(());
        }
        store_draft(&dir, &draft)
    })
    .await
    .map_err(message)?
}

#[tauri::command]
pub async fn clear_draft(
    app: AppHandle,
    key: String,
    path: String,
    through: u64,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let _root = store.lock_root(&key)?;
        let path = entry(&folder(&store, &key), &path)?;
        if read_draft(&path).is_some_and(|draft| draft.saved_at <= through) {
            match fs::remove_file(path) {
                Ok(()) => (),
                Err(err) if err.kind() == io::ErrorKind::NotFound => (),
                Err(err) => return Err(message(err)),
            }
        }
        Ok(())
    })
    .await
    .map_err(message)?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn draft_survives_without_the_original_file() {
        let dir = tempfile::tempdir().unwrap();
        let draft = Draft {
            path: "Notes/Draft.md".into(),
            text: "Unsaved 🚀\r\n".into(),
            base: "Original".into(),
            saved_at: 17,
        };
        store_draft(dir.path(), &draft).unwrap();
        let again = read_draft(&entry(dir.path(), &draft.path).unwrap()).unwrap();
        assert_eq!(again.text, draft.text);
        assert_eq!(again.saved_at, 17);
        assert!(entry(dir.path(), "../Draft.md").is_err());
    }
}
