---
name: rightmark
description: A quiet macOS workspace for local Markdown files.
colors:
  canvas: '#191919'
  document-canvas: '#171717'
  chrome: '#141414'
  light-chrome: '#f0efec'
  surface: '#202020'
  overlay: '#242424'
  ink-panel: '#111111'
  hover: '#292929'
  press: '#3c3c3c'
  control-on: '#373735'
  selected: '#2c2c2c'
  ink: '#eeedea'
  body: '#d8d7d3'
  muted: '#a5a39e'
  primary: '#ecebe7'
  primary-text: '#1d1d1b'
  accent: '#e0dfda'
  link: '#ffffff'
  focus: '#ffffff'
  edge: '#3a3a3a'
  panel-edge: '#252525'
  preview-close: '#ff5f57'
  preview-minimize: '#ffbd2e'
  preview-zoom: '#28c840'
  command-checkbox: '#eeedea'
  command-checkbox-ink: '#171717'
  yellow-marker-dark: '#504a21'
  yellow-marker-light: '#f3e6ab'
typography:
  key:
    fontSize: '11px'
    lineHeight: '16px'
  caption:
    fontSize: '12px'
    lineHeight: '18px'
  control:
    fontSize: '13px'
    lineHeight: '20px'
  navigation:
    fontSize: '14px'
    lineHeight: '20px'
  document:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '16px'
    lineHeight: '26px'
  subheading:
    fontSize: '18px'
    lineHeight: '26px'
  heading:
    fontSize: '23px'
    lineHeight: '30px'
  page-heading:
    fontSize: '30px'
    lineHeight: '36px'
  note-heading:
    fontSize: '36px'
    lineHeight: '42px'
rounded:
  caret: '1px'
  small: '4px'
  menu-row: '5px'
  compact: '6px'
  control: '7px'
  row: '8px'
  popover: '12px'
  workspace-corner: '12px'
  dialog: '14px'
  ink-dialog: '18px'
components:
  primary-button:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-text}'
    rounded: '{rounded.row}'
    height: '36px'
---

# rightmark design system

## Overview

**One window, one writing surface.** File navigation and tools frame the note; they do not compete with it. Keep frequent actions close to the text, and reveal secondary actions only when asked. Home is a place to open a folder or return to a note, not a dashboard.

## Colors

[`src/tokens.css`](src/tokens.css) is the source of truth. In Dark, title bar and sidebar share `#141414`; the document is `#171717`; pickers and focused dialogs use `#111111`. In Light, warm gray chrome frames a white document. Links and focus are near-white in Dark and charcoal in Light. Use semantic states rather than adding accent colors. Reserve red for errors, overdue dates, and destructive actions, always with a text or icon cue.

## Typography

Inter Variable ships locally in regular and italic. Use 12/18 for captions, 13/20 for controls, 14/20 for navigation, 16/26 for body text, and 36/42 for document titles. Markdown source stays monospaced. Give titles weight and spacing before reaching for color. Allow long note names and paths to wrap in content; truncate only in narrow controls and provide the full label.

## Layout

The title bar is 44 px tall. The sidebar is 248 px at the default desktop size and narrows with the window. Tabs align with the document edge. The default writing measure is 675 px and adjusts with the writing-width preference. The document reaches the right and bottom window edges; Backlinks is a quiet control at its lower left. Keep save and recovery feedback visible above the editor. Check layouts at the minimum supported window size, not just at the default width.

## Elevation & Depth

Separate the frame from the page through tone rather than busy borders. Menus sit above the document with one hairline and a soft shadow. Use a scrim only when the action requires focused interaction, such as version recovery or confirming a destructive change.

## Shapes

Use 7–8 px corners for controls, 12 px for popovers, and 14–18 px for dialogs. Use 28 px icon controls in the title bar, 32 px for standard controls, and 36 px for main actions. The app icon is the dark R/arrow mark on a rounded off-white tile with transparent margins. [`public/rightmark.svg`](public/rightmark.svg) is its canonical source.

## Components

**Home and sidebar:** Use a quiet welcome and file actions above recents. Home, Today, Inbox, Graph, and Tasks are primary destinations. The file tree uses 13 px labels and 32 px rows. Keep Trash and Settings in the sidebar footer.

**Document menu:** Keep search, theme, and document view in the title bar; Quick Capture is opt-in. Put Editor, Split, Preview, Outline, image and emoji insertion, and Version history in the document menu. Show Outline only when headings are available.

**Folders:** A single disclosure chevron turns while the child rows open together. The grid track expands in 190 ms and closes in 165 ms. Keyboard activation and reduced motion skip the transition. Closed rows are inert immediately.

**Hover preview:** After a deliberate pointer pause, a small card opens beside the file without moving the document or creating a tab.

**Tooltips:** Rounded, theme-aware labels with a thin border and a muted shortcut when available. Delay the first pointer hint; show nearby hints and keyboard-focus hints without an animation. Keep native browser tooltips out of the app chrome.

**Slash menu:** An elevated picker sits beside the slash. Use a thin border and 12 px corners shared with other menus, 34 px rows, and subtle rules between Text, List, and Blocks. Text and headings show typographic previews. Selection uses a neutral fill. The menu opens instantly and scrolls independently.

**Selection toolbar:** Put a compact floating formatting bar above a text selection, or below when there is no room. Its overlay material and outline distinguish it from the permanent toolbar. Keep focus in the editor for pointer formatting; link editing can take focus. `Option–F10` enters the toolbar from a selection. A direct hover on the left gutter reveals the matching block handle without crossing the text first. Show an insertion line during the drag, with no animation lag behind the pointer.

**Document toolbar:** Center unboxed groups aligned with the writing column. Direct controls cover common inline formats and lists; headings, quotes, strikethrough, undo, and redo live in the overflow. The block handle stays in the gutter, left of list markers.

**Quick Search:** Use a near-black, rounded panel that fits the results up to the viewport limit. Keep the input visible while results scroll independently. Show filename, folder, and highlighted excerpt without a section label or keyboard footer.

**Quick Capture and Inbox:** The rounded capture window opens immediately with a focused writing area. Keep its destination out of the composition. Inbox pairs a chronological list with a separate reading surface and a quiet action strip. Never require a tagging or filing decision when capturing.

**Dropdowns and Backlinks:** Use a rounded, scrollable picker with a visible selected state and keyboard navigation. Add search for longer lists. Backlinks group mentions by note and distinguish the filename, folder, and excerpt.

**Tasks and Today:** Group task rows by note, put dates on the trailing edge, and keep new-task composition inline. Today is a separate journal page with a date picker and the same editor as a regular note.

**Version history and conflicts:** Use a compact, single-column comparison. Do not use a second sidebar, counters, or redundant tabs. When a save conflicts with the disk version, make **Compare** visible and make **Save a copy** safer and easier than discarding edits.

**Annotation palette:** Text color and Highlight are independent. Both open a vertical list with named swatches and a check beside the active choice. Yellow highlight uses a muted olive-gold background in Dark and soft ochre in Light. Default clears only the current annotation.

**Theme switch:** The title bar button directly toggles Light and Dark. On a pointer click the new theme reveals from the button over 420 ms; older webviews fade the main surfaces instead. Keyboard switching stays immediate, as does switching with motion disabled. System stays available in Settings.

**Caret:** Typed characters appear immediately. The visual editor caret blinks on idle and can be set to steady in Settings. A 65 ms glide applies only to short horizontal movement and is skipped with reduced motion. The empty note hints at the slash command menu.

**Link graph:** Notes and their actual internal links occupy the canvas. Incoming links affect node size. Faint pan-aligned dots provide a sense of scale. Hover highlights a neighborhood without moving it; zoom and drag are direct controls. The local scope starts at the last open note.

## Do's and Don'ts

- Keep the sidebar and title bar on the same continuous surface.
- Use panel rounding and tonal contrast instead of a separator at the inside corner.
- Do not add repeated workspace labels or decorative branding to the window chrome.
- Keep keyboard focus visible and honor Reduce Motion. Skip entrance animation for typing, keyboard navigation, and frequently opened pickers.
- Use illustrative sample notes for public screenshots. Never use a real workspace or a test fixture containing private data.
