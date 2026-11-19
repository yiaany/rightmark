# Contributing to rightmark

Thanks for helping make rightmark a better place to write. Small, focused changes are welcome, especially improvements to Markdown compatibility, keyboard navigation, and reliability.

## Set up locally

Use Node.js **22.18+**, stable Rust, and the macOS command-line developer tools.

```sh
npm ci
npm run tauri -- dev
```

For interface work, `npm run dev` starts a browser demo with isolated browser storage. Use the desktop build for filesystem, shortcut, clipboard, and window behavior. Test file operations on a copy of a workspace.

## Find your way around

| Path | What belongs there |
| --- | --- |
| `src/components/` | Svelte screens and controls |
| `src/lib/` | Editor, Markdown, and workspace logic |
| `src-tauri/` | macOS integration, filesystem commands, and bundle configuration |
| `sample/` | Bundled example workspace |
| `tests/` | JavaScript regression tests |
| `docs/` | User guide and release documentation |

## Before opening a pull request

1. Open an issue first for a new dependency, a storage format change, or a substantial UI change. For a bug, include the app and macOS versions, the expected behavior, and steps to reproduce with sample data.
2. Keep changes scoped. Preserve existing Markdown and preference compatibility. Document observable changes in the [workspace guide](docs/WORKSPACE.md) and follow [DESIGN.md](DESIGN.md) for UI changes.
3. Add a regression test for changed behavior. For UI work, include screenshots or a short recording and note what you tested with the keyboard.
4. Do not include private notes, credentials, generated bundles, or installers. Describe what changed, why, and which checks you ran.

```sh
npm run check
npm test
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml
git diff --check
```

The [release checklist](docs/RELEASE.md) covers packaging and native smoke tests. By contributing, you agree that your contribution is covered by the project's [MIT License](LICENSE).
