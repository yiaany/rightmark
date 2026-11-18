<script lang="ts">
  import { flip } from 'svelte/animate'
  import { CodeXml, Eye, House, PanelLeft, Plus, Search, SquareSplitHorizontal, X } from '@lucide/svelte'
  import { noteName } from '../lib/notes.ts'
  import { native } from '../lib/storage.ts'
  import type { Mode, Workspace } from '../lib/workspace.svelte.ts'

  let { workspace, sidebar, toggleSidebar, search }: { workspace: Workspace; sidebar: boolean; toggleSidebar: () => void; search: () => void } = $props()
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
  <div class="window-controls" class:browser={!native} aria-hidden="true">{#if !native}<i></i><i></i><i></i>{/if}</div>
  <button type="button" class="icon-button side-toggle" aria-label="Toggle sidebar" aria-pressed={sidebar} title="Toggle sidebar" onclick={toggleSidebar}><PanelLeft size={16} /></button>
  <div class="top-divider"></div>
  <button type="button" class="icon-button home-tab" aria-label="Home" aria-pressed={workspace.page === 'home'} title="Home" onclick={() => workspace.show('home')}><House size={16} /></button>
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
        <button type="button" data-note={path} aria-pressed={workspace.page === 'note' && workspace.activePath === path} title={path} onclick={() => void workspace.open(path)} onkeydown={(event) => focusTab(event, path)}><span>{noteName(path)}</span></button>
        <button type="button" class="tab-close" aria-label={`Close ${noteName(path)}`} title="Close tab" onclick={() => void workspace.close(path)}><X size={13} /></button>
      </div>
    {/each}
  </div>
  <button type="button" class="icon-button tab-add" aria-label="New tab" title="New note (⌘N)" disabled={workspace.busy} onclick={() => void workspace.create()}><Plus size={17} /></button>
  <div class="drag-space" data-tauri-drag-region></div>
  {#if workspace.page === 'note' && workspace.active}
    <div class="view-modes" role="group" aria-label="Document view">
      {#each modes as mode (mode.id)}
        <button type="button" aria-pressed={workspace.active.mode === mode.id} aria-label={mode.label} title={mode.label} onclick={() => changeMode(mode.id)}><mode.icon size={15} /><span>{mode.label}</span></button>
      {/each}
    </div>
  {/if}
  <button type="button" class="icon-button top-search" aria-label="Quick search" title="Quick search (⌘K)" onclick={search}><Search size={17} /></button>
</header>
