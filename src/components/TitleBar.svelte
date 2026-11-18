<script lang="ts">
  import { flip } from 'svelte/animate'
  import { CodeXml, Eye, House, PanelLeft, Plus, Search, SquarePen, SquareSplitHorizontal, X } from '@lucide/svelte'
  import ThemeSwitch from './ThemeSwitch.svelte'
  import { noteName } from '../lib/notes.ts'
  import { native } from '../lib/storage.ts'
  import type { Mode, Workspace } from '../lib/workspace.svelte.ts'

  let { workspace, sidebar, toggleSidebar, search, capture, captureKey, appliedTheme, onTheme }: {
    workspace: Workspace; sidebar: boolean; toggleSidebar: (animate: boolean) => void; search: () => void; capture: () => void; captureKey: string; appliedTheme: 'light' | 'dark'; onTheme: (theme: 'light' | 'dark') => void
  } = $props()
  let dragged = $state('')
  const modes = [{ id: 'editor', label: 'Editor', icon: CodeXml }, { id: 'split', label: 'Split', icon: SquareSplitHorizontal }, { id: 'preview', label: 'Preview', icon: Eye }] as const

  function changeMode(mode: Mode) {
    if (!workspace.active) return
    workspace.active.syncView?.()
    workspace.active.mode = mode
  }
  function focusTab(event: KeyboardEvent, path: string) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const index = workspace.tabs.indexOf(path)
    const next = workspace.tabs[index + (event.key === 'ArrowLeft' ? -1 : 1)]
    if (!next) return
    event.preventDefault()
    if (event.altKey) workspace.reorder(path, next)
    else {
      void workspace.open(next)
      const buttons = [...(event.currentTarget as HTMLElement).closest('.tab-strip')!.querySelectorAll<HTMLButtonElement>('button[data-note]')]
      buttons.find((button) => button.dataset.note === next)?.focus()
    }
  }
</script>

<header class="titlebar" data-tauri-drag-region>
  <div class="titlebar-leading" data-tauri-drag-region>
    <div class="window-controls" class:browser={!native} aria-hidden="true">{#if !native}<i></i><i></i><i></i>{/if}</div>
    <button type="button" class="icon-button side-toggle" aria-label="Toggle sidebar" aria-expanded={sidebar} aria-controls="workspace-sidebar" data-tooltip="Toggle sidebar" data-tooltip-key="⌘⇧B" onclick={(event) => toggleSidebar(event.detail > 0)}><PanelLeft size={16} strokeWidth={1.6} /></button>
    {#if !sidebar}<button type="button" class="icon-button home-tab" aria-label="Home" aria-pressed={workspace.page === 'home'} data-tooltip="Home" onclick={() => workspace.show('home')}><House size={16} strokeWidth={1.6} /></button>{/if}
  </div>
  <div class="titlebar-document" data-tauri-drag-region>
    <div class="tab-strip" role="group" aria-label="Open notes">
      {#each workspace.tabs as path (path)}
        <div class="tab" class:active={workspace.page === 'note' && workspace.activePath === path} class:dragged={dragged === path}
          animate:flip={{ duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180 }}
          role="presentation" draggable="true"
          ondragstart={(event) => { dragged = path; event.dataTransfer?.setData('text/plain', noteName(path)); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move' }}
          ondragenter={(event) => { if (dragged) { event.preventDefault(); workspace.reorder(dragged, path) } }}
          ondragover={(event) => { if (dragged) event.preventDefault() }}
          ondrop={(event) => { if (dragged) { event.preventDefault(); dragged = '' } }}
          ondragend={() => { dragged = '' }}>
          <button type="button" data-note={path} aria-pressed={workspace.page === 'note' && workspace.activePath === path} data-tooltip={path} onclick={() => void workspace.open(path)} onkeydown={(event) => focusTab(event, path)}><span>{noteName(path)}</span></button>
          <button type="button" class="tab-close" aria-label={`Close ${noteName(path)}`} data-tooltip="Close tab" onclick={() => void workspace.close(path)}><X size={13} /></button>
        </div>
      {/each}
    </div>
    {#if workspace.tabs.length || !sidebar}<button type="button" class="icon-button tab-add" aria-label="New note" data-tooltip="New note" data-tooltip-key="⌘N" disabled={workspace.busy} onclick={() => void workspace.create()}><Plus size={16} strokeWidth={1.6} /></button>{/if}
    <div class="drag-space" data-tauri-drag-region></div>
    {#if workspace.page === 'note' && workspace.active}
      <div class="view-modes" role="group" aria-label="Document view">
        {#each modes as mode (mode.id)}
          <button type="button" aria-pressed={workspace.active.mode === mode.id} aria-label={mode.label} data-tooltip={mode.label} onclick={() => changeMode(mode.id)}><mode.icon size={15} strokeWidth={1.55} /></button>
        {/each}
      </div>
    {/if}
    <button type="button" class="icon-button" aria-label="Quick Capture" data-tooltip="Quick Capture" data-tooltip-key={captureKey} onclick={capture}><SquarePen size={16} strokeWidth={1.6} /></button>
    <button type="button" class="icon-button top-search" aria-label="Quick search" data-tooltip="Quick search" data-tooltip-key="⌘K" onclick={search}><Search size={16} strokeWidth={1.6} /></button>
    <ThemeSwitch dark={appliedTheme === 'dark'} change={onTheme} />
  </div>
</header>
