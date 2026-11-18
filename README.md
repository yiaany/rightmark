# Folio

Folio is a small local Markdown workspace for macOS. Open a folder, switch between visual editing and source, and keep track of Markdown checkboxes without moving them into a database.

In Preview, type `/` on an empty line to insert headings, lists, tables, quotes, code, or dividers. Tables stay in the Markdown file. Open **Graph** from the sidebar or with `⌘⇧G` to browse the folder's internal links, or choose **Local** after opening a note. Change appearance in **Settings** (`⌘,`) or from the title bar.

Select text in Preview for inline formatting, links, text color, and highlights. The two annotations are independent and stored in Markdown as inline `<span data-folio-color="…">` and `<mark data-folio-highlight="…">` with palette keys. Hover beside a paragraph or list item and drag its handle to reorder it among siblings. `Option–Shift–↑ / ↓` moves the current block without a mouse.

Press `Control–Shift–N` from any Mac app while Folio is running, or choose **Quick Capture** in the menu bar. `Command–Return` saves to `Inbox/`; `Escape` hides the window without deleting the draft. The shortcut can be changed in Settings. From Inbox, keep a capture as a note, add it to an existing note, make it a task, or archive it. Undo restores the last processed item if the destination has not changed. Captures saved before choosing a folder are kept in the local Inbox and remain visible after switching to a personal folder.

Use `Command–K` to search filenames, folders, and note text. An excerpt highlights the first match, and opening it jumps to that text in the document. Matches only visible in raw Markdown open in Editor mode.

## Development

Use Node.js 22.18 or later, Rust, and the macOS command-line developer tools. Install the locked dependencies with `npm ci`. Use `npm run tauri -- dev` for the native app or `npm run dev` for an isolated browser demo. The demo uses browser storage and never reads or changes your local folders.

`npm run check` checks the TypeScript and Svelte code. `npm test` runs the workspace tests. `cargo test --manifest-path src-tauri/Cargo.toml` tests native file storage. `npm run tauri -- build --bundles app` creates the local macOS app bundle; builds from this repository are unsigned.

See [DESIGN.md](DESIGN.md) for the window layout and interaction details. The macOS app icon is generated from `assets/folio-icon.svg` with the Tauri CLI.

## Storage

The selected folder is the source of truth. Existing `.md` and `.markdown` files are read in place. The sample workspace is stored separately in Folio's application data directory. Original Markdown remains readable without Folio. The application compares the saved revision before replacing a note and refuses to overwrite an external change. Visual editing is limited to Markdown the editor can safely represent; source mode remains available for any supported file.

## License

Folio's source and artwork are MIT-licensed. Markpad (BSD-3-Clause) and Novel (Apache-2.0) are interaction references, not vendored code. Runtime dependencies retain their own licenses.
