# Windows preview

The Windows preview uses the same app and Markdown format as the Mac release. It targets Windows 11 x64 first, with a per-user NSIS setup executable. Use the **Windows preview** workflow in GitHub Actions; a push to `windows-preview` runs it, too. The `rightmark-windows-x64` artifact contains `*-setup.exe` and its SHA-256 checksum. It is not uploaded to GitHub Releases automatically.

This preview is unsigned. Windows SmartScreen may warn. The installer uses the system Edge WebView2 runtime and can download the bootstrapper when needed. Once installed, the editor works locally. Windows renders emoji with its system font for now; Markdown stores the same Unicode characters on both platforms, but the artwork is not identical.

## Build on Windows

Use Node.js 22.18 or later, Rust stable for `x86_64-pc-windows-msvc`, Microsoft C++ Build Tools with the Desktop development with C++ workload, and Edge WebView2. See [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/#windows).

```powershell
npm ci
npm run tauri -- build --ci --no-sign --target x86_64-pc-windows-msvc --bundles nsis -- --locked
```

The installer is under `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`.

## Before publishing

On an actual Windows machine, install and launch from the Start menu. Open a test folder with non-ASCII names and nested notes. Check **Ctrl+K** search, **Ctrl+Shift+N** global capture, Inbox actions, task editing, image paste and drop, note move and restore, app relaunch, and uninstall. Verify the workspace is not removed on uninstall. Add Windows code signing before a stable public release.
