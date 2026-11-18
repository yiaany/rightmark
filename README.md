# Folio

Folio is a small local Markdown workspace for macOS. Open a folder, switch between visual editing and source, and keep track of Markdown checkboxes without moving them into a database.

## Development

Use Node.js 22.18 or later, Rust, and the macOS command-line developer tools. Install the locked dependencies with `npm ci`. Use `npm run tauri -- dev` for the native app or `npm run dev` for an isolated browser demo. The demo uses browser storage and never reads or changes your local folders.

`npm run check` checks the TypeScript and Svelte code. `npm test` runs the workspace tests. `cargo test --manifest-path src-tauri/Cargo.toml` tests native file storage. `npm run tauri -- build --bundles app` creates the local macOS app bundle; builds from this repository are unsigned.

## Storage

The selected folder is the source of truth. Existing `.md` and `.markdown` files are read in place. The sample workspace is stored separately in Folio's application data directory. Original Markdown remains readable without Folio. The application compares the saved revision before replacing a note and refuses to overwrite an external change. Visual editing is limited to Markdown the editor can safely represent; source mode remains available for any supported file.

## License

Folio's source and artwork are MIT-licensed. Markpad (BSD-3-Clause) and Novel (Apache-2.0) are interaction references, not vendored code. Runtime dependencies retain their own licenses.
