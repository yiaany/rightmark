use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use sha2::{Digest, Sha256};
use tauri::ipc::Response;

const MAX_BYTES: usize = 16 * 1024 * 1024;
const DIRECTORY: &str = "Attachments";

fn format(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("jpg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("gif")
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Some("webp")
    } else if bytes.get(4..8) == Some(b"ftyp")
        && matches!(bytes.get(8..12), Some(b"avif" | b"avis"))
    {
        Some("avif")
    } else {
        None
    }
}

fn regular_file(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative
        .split('/')
        .any(|part| part.is_empty() || part.starts_with('.') || part.contains(['\\', ':']))
    {
        return Err("Invalid image path.".into());
    }
    let candidate = root.join(relative);
    if candidate.canonicalize().map_err(message)? != candidate
        || !candidate.symlink_metadata().map_err(message)?.is_file()
    {
        return Err("Choose a regular image inside the workspace.".into());
    }
    Ok(candidate)
}

fn store(root: &Path, bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_BYTES {
        return Err("An image can be at most 16 MB.".into());
    }
    let ext = format(bytes).ok_or("Choose a PNG, JPEG, GIF, WebP, or AVIF image.")?;
    let folder = root.join(DIRECTORY);
    match fs::create_dir(&folder) {
        Ok(()) => (),
        Err(err) if err.kind() == io::ErrorKind::AlreadyExists => (),
        Err(err) => return Err(message(err)),
    }
    if folder.canonicalize().map_err(message)? != folder
        || !folder.symlink_metadata().map_err(message)?.is_dir()
    {
        return Err("Attachments must be a regular workspace folder.".into());
    }
    let relative = format!("{DIRECTORY}/{:x}.{ext}", Sha256::digest(bytes));
    let dest = root.join(&relative);
    let mut temp = tempfile::NamedTempFile::new_in(&folder).map_err(message)?;
    temp.write_all(bytes).map_err(message)?;
    temp.as_file().sync_all().map_err(message)?;
    match temp.persist_noclobber(&dest) {
        Ok(_) => Ok(relative),
        Err(error) if error.error.kind() == io::ErrorKind::AlreadyExists => {
            let existing = regular_file(root, &relative)?;
            let mut current = Vec::new();
            fs::File::open(existing)
                .map_err(message)?
                .take(MAX_BYTES as u64 + 1)
                .read_to_end(&mut current)
                .map_err(message)?;
            if current == bytes {
                Ok(relative)
            } else {
                Err("An existing attachment occupies this image’s path.".into())
            }
        }
        Err(error) => Err(message(error.error)),
    }
}

#[tauri::command]
pub async fn save_image(app: AppHandle, key: String, encoded: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if encoded.len() > MAX_BYTES.div_ceil(3) * 4 {
            return Err("An image can be at most 16 MB.".into());
        }
        let bytes = STANDARD.decode(encoded).map_err(message)?;
        let store_state = app.state::<Store>();
        let _writes = store_state.writes.lock().map_err(message)?;
        let root = store_state.lock_root(&key)?;
        store(&root, &bytes)
    })
    .await
    .map_err(message)?
}

#[tauri::command]
pub async fn read_image(app: AppHandle, key: String, path: String) -> Result<Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = app.state::<Store>().active_root(&key)?;
        if !matches!(
            Path::new(&path)
                .extension()
                .and_then(|ext| ext.to_str())
                .map(str::to_ascii_lowercase)
                .as_deref(),
            Some("png" | "jpg" | "jpeg" | "gif" | "webp" | "avif")
        ) {
            return Err("Unsupported image format.".into());
        }
        let mut bytes = Vec::new();
        fs::File::open(regular_file(&root, &path)?)
            .map_err(message)?
            .take(MAX_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(message)?;
        if bytes.len() > MAX_BYTES || format(&bytes).is_none() {
            return Err("Invalid or oversized image.".into());
        }
        Ok(Response::new(bytes))
    })
    .await
    .map_err(message)?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn images_are_deduplicated_and_unsafe_formats_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let bytes = b"\x89PNG\r\n\x1a\nimage";
        let path = store(&root, bytes).unwrap();
        assert_eq!(store(&root, bytes).unwrap(), path);
        assert_eq!(
            fs::read(regular_file(&root, &path).unwrap()).unwrap(),
            bytes
        );
        assert!(regular_file(&root, "../secret.png").is_err());
        assert!(store(&root, b"<svg/>").is_err());
    }
}
