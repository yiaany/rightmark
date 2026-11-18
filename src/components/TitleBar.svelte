<script lang="ts">
  import { flip } from 'svelte/animate'
  import { CodeXml, Eye, House, Monitor, Moon, PanelLeft, Plus, Search, SquareSplitHorizontal, Sun, X } from '@lucide/svelte'
  import { onMount, tick } from 'svelte'
  import ThemeOptions from './ThemeOptions.svelte'
  import { noteName } from '../lib/notes.ts'
  import type { Theme } from '../lib/appearance.ts'
  import { native } from '../lib/storage.ts'
  import type { Mode, Workspace } from '../lib/workspace.svelte.ts'

  let { workspace, sidebar, toggleSidebar, search, theme, onTheme }: {
    workspace: Workspace; sidebar: boolean; toggleSidebar: (animate: boolean) => void; search: () => void; theme: Theme; onTheme: (theme: Theme) => void
  } = $props()
  let dragged = $state('')
  let appearance = $state(false)
  let picker: HTMLDivElement
  let themeButton: HTMLButtonElement
  let ThemeIcon = $derived(theme === 'system' ? Monitor : theme === 'light' ? Sun : Moon)
  const modes = [{ id: 'editor', label: 'Editor', icon: CodeXml }, { id: 'split', label: 'Split', icon: SquareSplitHorizontal }, { id: 'preview', label: 'Preview', icon: Eye }] as const

  onMount(() => {
    const dismiss = (event: PointerEvent) => { if (event.target instanceof Node && !picker.contains(event.target)) appearance = false }
    window.addEventListener('pointerdown', dismiss)
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !appearance) return
      appearance = false
      if (picker.contains(document.activeElement)) themeButton.focus()
    }
    window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('pointerdown', dismiss); window.removeEventListener('keydown', escape) }
  })

  function toggleAppearance(event: MouseEvent) {
    appearance = !appearance
    if (appearance && event.detail === 0) void tick().then(() => picker.querySelector<HTMLButtonElement>('.theme-options [aria-pressed=true]')?.focus())
  }

  function pick(next: Theme) {
    onTheme(next)
    appearance = false
    themeButton.focus()
  }

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
    <button type="button" class="icon-button side-toggle" aria-label="Toggle sidebar" aria-expanded={sidebar} aria-controls="workspace-sidebar" title="Toggle sidebar (⌘⇧B)" onclick={(event) => toggleSidebar(event.detail > 0)}><PanelLeft size={16} strokeWidth={1.6} /></button>
    {#if !sidebar}<button type="button" class="icon-button home-tab" aria-label="Home" aria-pressed={workspace.page === 'home'} title="Home" onclick={() => workspace.show('home')}><House size={16} strokeWidth={1.6} /></button>{/if}
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
          <button type="button" data-note={path} aria-pressed={workspace.page === 'note' && workspace.activePath === path} title={path} onclick={() => void workspace.open(path)} onkeydown={(event) => focusTab(event, path)}><span>{noteName(path)}</span></button>
          <button type="button" class="tab-close" aria-label={`Close ${noteName(path)}`} title="Close tab" onclick={() => void workspace.close(path)}><X size={13} /></button>
        </div>
      {/each}
    </div>
    {#if workspace.tabs.length || !sidebar}<button type="button" class="icon-button tab-add" aria-label="New tab" title="New note (⌘N)" disabled={workspace.busy} onclick={() => void workspace.create()}><Plus size={16} strokeWidth={1.6} /></button>{/if}
    <div class="drag-space" data-tauri-drag-region></div>
    {#if workspace.page === 'note' && workspace.active}
      <div class="view-modes" role="group" aria-label="Document view">
        {#each modes as mode (mode.id)}
          <button type="button" aria-pressed={workspace.active.mode === mode.id} aria-label={mode.label} title={mode.label} onclick={() => changeMode(mode.id)}><mode.icon size={15} strokeWidth={1.55} /></button>
        {/each}
      </div>
    {/if}
    <button type="button" class="icon-button top-search" aria-label="Quick search" title="Quick search (⌘K)" onclick={search}><Search size={16} strokeWidth={1.6} /></button>
    <div class="appearance-picker" bind:this={picker}>
      <button type="button" class="icon-button" bind:this={themeButton} aria-label="Choose theme" aria-expanded={appearance} aria-controls={appearance ? 'titlebar-appearance' : undefined} title="Choose theme" onclick={toggleAppearance}><ThemeIcon size={16} strokeWidth={1.6} /></button>
      {#if appearance}<div class="appearance-menu" id="titlebar-appearance"><ThemeOptions {theme} onChange={pick} compact /></div>{/if}
    </div>
  </div>
</header>
