# Product

<!-- impeccable:product-schema 1 -->

## Platform

macOS desktop. The browser demo is for development and uses isolated storage.

## Stack

TypeScript, Svelte, Vite, Tauri, and Rust. Tiptap provides the visual editor; Monaco is isolated to Markdown source mode.

## Product Purpose

Open a folder, write in a visual document or directly in Markdown, and turn the things worth doing into checkboxes. The app works without a network or an account.

## Capabilities and Constraints

- Keep Markdown on disk, editable in other applications. Do not duplicate tasks in a separate database.
- Keep a single window centered on writing. Quick Capture, Inbox, Today, and Tasks support the writing workflow rather than replacing it.
- Hovering a file in the sidebar previews its content without opening a tab. Preview mode remains editable.
- Ship an English interface, documentation, and source. No board, server, or AI dependency in the first build.

## Brand Commitments

Use the lowercase name **rightmark**. Keep the R/arrow mark monochrome and the writing surface neutral. See [DESIGN.md](DESIGN.md).
