---
name: Folio
description: A quiet macOS workspace for local Markdown files.
colors:
  canvas: '#181818'
  chrome: '#202020'
  surface: '#252423'
  selected: '#33312f'
  ink: '#eeeae4'
  muted: '#aaa49d'
  primary: '#e1d5c3'
  primary-text: '#24201c'
  link: '#c7b6a0'
  edge: '#3d3936'
typography:
  caption:
    fontSize: '11px'
  control:
    fontSize: '12px'
  interface:
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '13px'
    lineHeight: 1.4
  document:
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '15px'
    lineHeight: 1.7
rounded:
  control: '4px'
  panel: '6px'
  popover: '8px'
  workspace-corner: '12px'
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

The title bar and sidebar share `--chrome`. The document and its status bar share `--canvas`. Warm paper and subdued graphite replace saturated blue in the interface. Menus, view selections, and file selections use a quiet neutral fill, not a colored highlight.

## Layout

The title bar is 36 px high. The sidebar is 203 px wide at the default macOS window size and can be hidden. There is no rule between the bar and sidebar; the document exposes the chrome through a 12 px top-left radius. The body of a note is at most 675 px wide, independent of the editor pane width.

## Components

**Home:** A short prompt, two file actions, and a compact grid of recent notes. No decorative mark, workspace badge, or subtitle is needed.

**Folders:** A single disclosure chevron turns while the child rows open together. The grid track expands in 190 ms and closes in 165 ms. Keyboard activation and reduced motion skip the transition. Closed rows are inert immediately.

**Hover preview:** After a deliberate pointer pause, a small card opens beside the file without moving the document or creating a tab.

**Slash menu:** Group commands by Text, Lists, and Blocks. Use one line icon per command, neutral selection, and no persistent instruction in the editor toolbar.

**Caret:** Typed characters appear immediately. In the visual editor, a 65 ms glide applies only to short horizontal caret movement. Use the native caret for selection, IME, and reduced motion.

**Link graph:** Notes and their actual internal links occupy the canvas. Incoming links affect node size. Hover highlights a neighborhood without moving it; zoom and drag are direct controls. The local scope starts at the last open note.

## Do's and Don'ts

- Keep the sidebar and title bar on the same continuous surface.
- Use panel rounding and tonal contrast instead of a separator at the inside corner.
- Do not add repeated workspace labels or decorative branding to the window chrome.
