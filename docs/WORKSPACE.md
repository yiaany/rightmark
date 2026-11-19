# Working in rightmark

Open any folder of Markdown files, or try the bundled sample workspace. rightmark uses the selected folder in place; it does not import its contents into a database.

## Writing

- **Preview** is an editable, formatted view; **Editor** shows the source; **Split** shows both. Type `/` at the start of an empty line for blocks. Use the document view menu for **Outline**, **Insert image**, **Insert emoji**, and **Version history**.
- Type `[[` to link to a note. Folder paths distinguish identical titles. The **Backlinks** control at the bottom of the editor jumps to the exact mention. Click links in Preview, or Command-click in source.
- Paste or drop a screenshot to store it in `Attachments/` and insert a relative Markdown link. PNG, JPEG, GIF, WebP, and AVIF are supported up to 16 MB each. Bring the attachments folder along when copying the workspace. Undo removes the link, not the image file.
- Use **From template** to write from a starter or from a `.md` file under `Templates/`. `{{title}}` and `{{date}}` are substituted when creating a note.

## Capture and follow through

| Action | Default shortcut |
| --- | --- |
| Quick Capture | Control–Shift–N |
| Save a capture | Command–Return |
| Search notes | Command–K |
| Open Today | Command–Shift–D |
| Open Graph | Command–Shift–G |
| Settings | Command–Comma |

Quick Capture works from another Mac app while rightmark is running. Escape keeps the draft. **Inbox** lets you keep, append, convert to a task, or archive captures. **Today** is a separate journal backed by `Daily/YYYY-MM-DD.md`.

**Tasks** reads the open and completed checkboxes in your notes. **New task** adds a checkbox to a note you select or to `Tasks.md`. Assign an optional due date from Tasks or end the line with `📅 YYYY-MM-DD`.

## Files and recovery

- Use **Rename or move** from the file tree to change a note’s path without overwriting an existing file. rightmark adjusts resolved note links and local image links. For a capitalization-only rename, use an intermediate name.
- **Trash** is per workspace. Restore a note to its original path or explicitly confirm permanent deletion. Keep the hidden `.rightmark-trash/` directory if you want to preserve trashed files when moving a workspace.
- Unsaved edits are journaled in local app data. If a note changed on disk while you were editing, **Compare** lets you inspect both versions and save your changes as a separate file. Version history keeps up to 30 previous snapshots per note and is not a workspace backup.
- Open tabs, the active page, and editor positions are restored for each workspace. Document settings and shortcuts are in **Settings**.
