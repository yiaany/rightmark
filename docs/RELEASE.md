# Release checklist

## Build and distribution

Build Apple silicon macOS and Windows x64 from the same source commit. Use `npm run tauri -- build --ci --bundles app,dmg` on Mac and the **Windows preview** workflow (dispatch it for the release commit) for Windows.
Publish both installers and one `SHA256SUMS.txt` on a single GitHub release. Verify each installer against its source commit and checksum before publishing. Do not commit generated application bundles or installers.

- Run the Svelte/TypeScript check, the JavaScript and Rust tests, and `git diff --check` from a release commit.
- Build an optimized Tauri release, not a debug bundle. Build an Apple Silicon `.dmg` for the first release; build and verify an Intel or universal artifact separately before claiming Intel support. Keep the `com.yiaany.folio` identifier to preserve existing data.
- For public download, configure a Developer ID Application signing identity and Apple notarization credentials outside the repository. Follow [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/) and [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution). Verify Gatekeeper on a clean Mac. An unsigned release candidate is not the production download.
- Test upgrading in place from the previous release. Publish the minimum supported macOS version, architecture, checksum, and release notes with the artifact. Until there is an updater, document replacing the app in Applications as the update path.

## Native release gates

Use copies of real workspaces. Repeat on macOS 13 and a current macOS release before advertising that range.
On Windows, follow the [Windows smoke test](WINDOWS.md#before-publishing). Keep unsigned builds marked as public previews.

1. Create headings (including duplicates) and open Outline. Check exact jumps in Preview, Editor, and Split, with keyboard and pointer.
2. Paste an actual screenshot from the macOS clipboard, drop two files from Finder, and select an image via the picker. Reopen the note offline in each view. Move it to another folder and verify its Markdown still resolves the image. Check unsupported formats and oversized files.
3. Edit an open file in another app. A clean tab should reload. When both versions differ, confirm the original bytes are preserved, **Compare** shows both, and **Save a copy** creates a separate file. Also test a missing original and a read-only destination.
4. Force-quit during editing. Relaunch and check that journaled edits reappear. Try quitting normally with a conflicted note and resolving it after reopening. An unfinished journal write at the instant of a crash cannot be guaranteed.
5. Reopen a workspace with multiple tabs, different editor modes, and scrolled notes. Check the active view, order, caret or scroll position, and that each folder restores its own session.
6. Open Quick Capture from another Mac app, save and find the result in Inbox. Process it and undo. Verify the rounded native capture window in both appearances.
7. Smoke-test search, Today, Tasks, Trash, and version restoration in the installed release. Check narrow windows, keyboard focus, and launch without a network.
