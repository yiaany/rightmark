---
name: Folio
description: A quiet macOS workspace for local Markdown files.
colors:
  canvas: '#1a1a1a'
  chrome: '#202020'
  light-chrome: '#f5f4f1'
  surface: '#252525'
  selected: '#323232'
  ink: '#f2f2f2'
  muted: '#a4a4a4'
  primary: '#ffffff'
  primary-text: '#171717'
  accent: '#dedede'
  edge: '#3b3b3b'
  panel-edge: '#2d2d2d'
  preview-close: '#ff5f57'
  preview-minimize: '#ffbd2e'
  preview-zoom: '#28c840'
  command-checkbox: '#2b6de8'
typography:
  menu-label:
    fontSize: '10px'
  caption:
    fontSize: '11px'
  control:
    fontSize: '12px'
  interface:
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '13px'
    lineHeight: 1.4
  preview-copy:
    fontSize: '14px'
  document:
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '15px'
    lineHeight: 1.7
  command-title-glyph:
    fontSize: '16px'
  pane-heading:
    fontSize: '17px'
  split-subheading:
    fontSize: '19px'
  note-subheading:
    fontSize: '22px'
  settings-heading:
    fontSize: '24px'
  split-heading:
    fontSize: '27px'
  tasks-heading:
    fontSize: '30px'
  note-heading:
    fontSize: '35px'
rounded:
  caret: '1px'
  small: '4px'
  menu-row: '5px'
  control: '6px'
  group: '7px'
  popover: '8px'
  search: '9px'
  preferences: '10px'
  workspace-corner: '12px'
  command-picker: '14px'
  selection-pill: '999px'
components:
  primary-button:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-text}'
    rounded: '{rounded.control}'
    height: '32px'
---

# Design System: Folio

## Overview

**Creative North Star: "One window, one writing surface"**

The window follows Markpad's compact desktop proportions. The workspace has two visual layers: a single graphite surface for navigation and a darker surface for the document. Home is a file picker with recents, not a dashboard.

## Colors

In Dark, the title bar and sidebar share `#202020` and the canvas is `#1a1a1a`, including the editor and graph. Use pure white for the primary Home action. In Light, the shared chrome is `#f5f4f1` against a white canvas. Menus, view selections, and file selections use neutral fills. Light and System are available from the title bar and Settings. Monaco and the graph read the same CSS palette as the rest of the app.

## Layout

The title bar is 44 px high and the sidebar is 248 px wide at the default macOS window size. Native traffic lights and the sidebar toggle share the title bar's vertical centerline. Tabs begin above the document, aligned to the sidebar boundary when open. The theme picker sits at the right; window minimization stays in the native traffic lights. The sidebar and title bar remain continuous. Workspace panels use a 12 px radius with a barely lighter hairline. The document panel keeps the rounded upper-left corner and extends to the right and bottom window edges without an inset, border, or status bar on those edges. Save failures remain visible above the editor. The note body is at most 675 px wide.

## Components

**Home:** A centered welcome, two compact file actions, and a quiet two-column list of recent notes. No decorative mark, workspace badge, or subtitle is needed.

**Sidebar:** Home, Graph, and Tasks use 14 px labels in 36 px rows. The file tree uses 14 px labels in 32 px rows, with Lucide glyphs and consistent indentation. File actions sit at the right of the tree heading. Settings stays at the bottom below a short horizontal rule.

**Folders:** A single disclosure chevron turns while the child rows open together. The grid track expands in 190 ms and closes in 165 ms. Keyboard activation and reduced motion skip the transition. Closed rows are inert immediately.

**Hover preview:** After a deliberate pointer pause, a small card opens beside the file without moving the document or creating a tab.

**Tooltips:** Rounded, theme-aware labels with a thin border and a muted shortcut when available. Delay the first pointer hint; show nearby hints and keyboard-focus hints without an animation. Keep native browser tooltips out of the app chrome.

**Slash menu:** A dark canvas-colored picker (white in Light) sits beside the slash. Use a thin border, 14 px corners, 34 px rows, and subtle rules between Text, List, and Blocks. Text and headings show typographic previews; the blue checkbox glyph is the only colored icon. Selection uses a neutral fill. The menu opens instantly and scrolls independently.

**Selection toolbar:** Put a compact, pill-shaped formatting bar above a text selection, or below when there is no room. Keep focus in the editor for pointer formatting; link editing can take focus. `Option–F10` enters the toolbar from a selection. A direct hover on the left gutter reveals the matching block handle without crossing the text first. Show an insertion line during the drag, with no animation lag behind the pointer.

**Caret:** Typed characters appear immediately. In the visual editor, a 65 ms glide applies only to short horizontal caret movement. Use the native caret for selection, IME, and reduced motion.

**Link graph:** Notes and their actual internal links occupy the canvas. Incoming links affect node size. Faint pan-aligned dots provide a sense of scale. Hover highlights a neighborhood without moving it; zoom and drag are direct controls. The local scope starts at the last open note.

## Do's and Don'ts

- Keep the sidebar and title bar on the same continuous surface.
- Use panel rounding and tonal contrast instead of a separator at the inside corner.
- Do not add repeated workspace labels or decorative branding to the window chrome.
