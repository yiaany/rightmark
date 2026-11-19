<script lang="ts">
  import { tick } from 'svelte'
  import { flip } from 'svelte/animate'
  import { Check, ChevronDown, CodeXml, Eye, History, House, ImagePlus, ListTree, PanelLeft, Plus, Search, Smile, SquarePen, SquareSplitHorizontal, X } from '@lucide/svelte'
  import ThemeSwitch from './ThemeSwitch.svelte'
  import { noteName } from '../lib/notes.ts'
  import { native } from '../lib/storage.ts'
  import { windows } from '../lib/platform.ts'
  import type { Mode, Workspace } from '../lib/workspace.svelte.ts'
  import { displayShortcut, type Bindings } from '../lib/shortcuts.ts'
  import { noteHeadings } from '../lib/markdown.ts'

  let { workspace, sidebar, toggleSidebar, search, capture, captureButton, history, openEmoji, openOutline, pickImages, keys, appliedTheme, onTheme }: {
    workspace: Workspace; sidebar: boolean; toggleSidebar: (animate: boolean) => void; search: () => void; capture: () => void; captureButton: boolean; history: (path: string) => void; openEmoji: () => void; openOutline: () => void; pickImages: () => void; keys: Bindings; appliedTheme: 'light' | 'dark'; onTheme: (theme: 'light' | 'dark') => void
  } = $props()
  let dragged = $state('')
  const modes = [{ id: 'editor', label: 'Editor', icon: CodeXml }, { id: 'split', label: 'Split', icon: SquareSplitHorizontal }, { id: 'preview', label: 'Preview', icon: Eye }] as const
  const view = $derived(modes.find(({ id }) => id === workspace.currentDocument?.mode) ?? modes[2])
  let viewOpen = $state(false)
  let viewRoot = $state<HTMLDivElement>(), viewButton = $state<HTMLButtonElement>(), viewMenu = $state<HTMLDivElement>()

  $effect(() => { workspace.page; workspace.currentDocument; viewOpen = false })

  async function openViews() {
    workspace.currentDocument?.syncView?.()
    viewOpen = true
    await tick()
    viewMenu?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
  }

  function viewKeys(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); viewOpen = false; viewButton?.focus(); return }
    if (event.key === 'Tab') { viewOpen = false; viewButton?.focus(); return }
    if (!viewMenu) return
    const buttons = [...viewMenu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    const index = buttons.indexOf(event.target as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowDown' ? (index + 1) % buttons.length : event.key === 'ArrowUp' ? (index + buttons.length - 1) % buttons.length : -1
    if (next >= 0) { event.preventDefault(); buttons[next]?.focus() }
  }

  function changeMode(mode: Mode) {
    const document = workspace.currentDocument
    if (!document) return
    document.syncView?.()
    document.mode = mode
    viewOpen = false
    viewButton?.focus()
  }
  function openHistory() {
    viewOpen = false
    viewButton?.focus()
    const path = workspace.currentDocument?.path
    if (path) history(path)
  }
  function menuAction(action: () => void) { viewOpen = false; viewButton?.focus(); action() }
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

<svelte:window onpointerdown={(event) => { if (viewOpen && viewRoot && !event.composedPath().includes(viewRoot)) viewOpen = false }} />

<header class="titlebar" data-tauri-drag-region>
  <div class="titlebar-leading" data-tauri-drag-region>
    {#if !windows || !native}<div class="window-controls" class:browser={!native} aria-hidden="true">{#if !native}<i></i><i></i><i></i>{/if}</div>{/if}
    <button type="button" class="icon-button side-toggle" aria-label="Toggle sidebar" aria-expanded={sidebar} aria-controls="workspace-sidebar" data-tooltip="Toggle sidebar" data-tooltip-key={displayShortcut(keys.sidebar)} onclick={(event) => toggleSidebar(event.detail > 0)}><PanelLeft size={16} strokeWidth={1.6} /></button>
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
    {#if workspace.tabs.length || !sidebar}<button type="button" class="icon-button tab-add" aria-label="New note" data-tooltip="New note" data-tooltip-key={displayShortcut(keys.newNote)} disabled={workspace.busy} onclick={() => void workspace.create()}><Plus size={16} strokeWidth={1.6} /></button>{/if}
    <div class="drag-space" data-tauri-drag-region></div>
    {#if workspace.currentDocument}
      <div class="view-picker" bind:this={viewRoot}>
        <button type="button" class="icon-button view-trigger" bind:this={viewButton} aria-label={`Document view: ${view.label}`} aria-haspopup="menu" aria-expanded={viewOpen} aria-controls={viewOpen ? 'document-views' : undefined} data-tooltip={viewOpen ? undefined : `Document view: ${view.label}`}
          onclick={() => viewOpen ? viewOpen = false : void openViews()} onkeydown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); void openViews() } }}>
          <view.icon size={15} strokeWidth={1.6} /><ChevronDown size={10} strokeWidth={1.75} />
        </button>
        {#if viewOpen}
          <div class="view-menu" id="document-views" role="menu" aria-label="Document view" bind:this={viewMenu}>
            {#each modes as mode (mode.id)}
              {@const shortcut = displayShortcut(keys[mode.id === 'editor' ? 'source' : mode.id])}
              <button type="button" role="menuitemradio" tabindex="-1" aria-checked={view.id === mode.id} onkeydown={viewKeys} onclick={() => changeMode(mode.id)}>
                <mode.icon size={15} strokeWidth={1.6} /><span>{mode.label}</span>{#if shortcut}<kbd>{shortcut}</kbd>{/if}<span class="view-check">{#if view.id === mode.id}<Check size={13} strokeWidth={1.8} />{/if}</span>
              </button>
            {/each}
            <div class="view-menu-rule" role="separator"></div>
            {#if workspace.currentDocument.jumpOutline && noteHeadings(workspace.currentDocument.text).length}
              <button type="button" role="menuitem" tabindex="-1" onkeydown={viewKeys} onclick={() => menuAction(openOutline)}><ListTree size={15} strokeWidth={1.6} /><span>Outline</span></button>
            {/if}
            <button type="button" role="menuitem" tabindex="-1" disabled={workspace.busy || !workspace.currentDocument.insertImages} onkeydown={viewKeys} onclick={() => menuAction(pickImages)}><ImagePlus size={15} strokeWidth={1.6} /><span>Insert image…</span></button>
            <button type="button" role="menuitem" tabindex="-1" disabled={workspace.busy || !workspace.currentDocument.insertEmoji} onkeydown={viewKeys} onclick={() => menuAction(openEmoji)}><Smile size={15} strokeWidth={1.6} /><span>Insert emoji…</span></button>
            <button type="button" role="menuitem" tabindex="-1" disabled={workspace.busy} onkeydown={viewKeys} onclick={openHistory}><History size={15} strokeWidth={1.6} /><span>Version history</span></button>
          </div>
        {/if}
      </div>
    {/if}
    {#if captureButton}<button type="button" class="icon-button" aria-label="Quick Capture" data-tooltip="Quick Capture" data-tooltip-key={displayShortcut(keys.capture)} onclick={capture}><SquarePen size={16} strokeWidth={1.6} /></button>{/if}
    <button type="button" class="icon-button top-search" aria-label="Quick search" data-tooltip="Quick search" data-tooltip-key={displayShortcut(keys.search)} onclick={search}><Search size={16} strokeWidth={1.6} /></button>
    <ThemeSwitch dark={appliedTheme === 'dark'} change={onTheme} />
  </div>
</header>
