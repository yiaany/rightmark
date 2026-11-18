---
name: Folio
description: A quiet macOS workspace for local Markdown files.
colors:
  canvas: '#181818'
  chrome: '#202020'
  surface: '#242424'
  selected: '#2d2e30'
  ink: '#e6edf3'
  muted: '#a3a7b0'
  primary: '#0078d4'
  link: '#79b7ff'
typography:
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
  workspace-corner: '12px'
components:
  primary-button:
    backgroundColor: '{colors.primary}'
    textColor: '#ffffff'
    rounded: '{rounded.control}'
    height: '32px'
---

# Design System: Folio

## Overview

**Creative North Star: "One window, one writing surface"**

The window follows Markpad's compact desktop proportions. The workspace has two visual layers: a single graphite surface for navigation and a darker surface for the document. Home is a file picker with recents, not a dashboard.

## Colors

The title bar and sidebar share `--chrome`. The document and its status bar share `--canvas`. Blue is for actions, links, and the active view, not ornament.

## Layout

The title bar is 36 px high. The sidebar is 203 px wide at the default macOS window size and can be hidden. There is no rule between the bar and sidebar; the document exposes the chrome through a 12 px top-left radius. The body of a note is at most 675 px wide, independent of the editor pane width.

## Components

**Home:** A short prompt, two file actions, and a compact grid of recent notes. No decorative mark, workspace badge, or subtitle is needed.

**Folders:** A disclosure chevron turns while the child rows open together. The grid track expands in 170 ms and closes in 145 ms. Keyboard activation and reduced motion skip the transition. Closed rows are inert immediately.

**Hover preview:** After a deliberate pointer pause, a small card opens beside the file without moving the document or creating a tab.

## Do's and Don'ts

- Keep the sidebar and title bar on the same continuous surface.
- Use panel rounding and tonal contrast instead of a separator at the inside corner.
- Do not add repeated workspace labels or decorative branding to the window chrome.
