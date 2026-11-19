<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity'
  import { tick } from 'svelte'
  import { CalendarDays, ChevronRight, Ellipsis, FileText, Folder, FolderOpen, House, Inbox, LayoutTemplate, ListChecks, Pencil, Plus, Settings2, Trash2, Waypoints } from '@lucide/svelte'
  import { noteName, type Note } from '../lib/notes.ts'
  import { hoverExcerpt } from '../lib/markdown.ts'
  import type { Workspace } from '../lib/workspace.svelte.ts'
  import { displayShortcut, type Bindings } from '../lib/shortcuts.ts'

  let { workspace, visible, keys, move, templates }: { workspace: Workspace; visible: boolean; keys: Bindings; move: (path: string) => void; templates: () => void } = $props()
  type FolderNode = { path: string; name: string; folders: Map<string, FolderNode>; files: Note[] }
  let closed = new SvelteSet<string>()
  let instant = $state('')
  let peek = $state<{ path: string; y: number; x: number; html: string }>()
  let fileMenu = $state<{ path: string; x: number; y: number; anchor: HTMLElement }>()
  let menuButton = $state<HTMLButtonElement>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: string | undefined
  const folder = (path: string, name: string): FolderNode => ({ path, name, folders: new Map(), files: [] })
  const destinations = [
    { id: 'home', label: 'Home', icon: House },
    { id: 'inbox', label: 'Inbox', icon: Inbox },
    { id: 'graph', label: 'Graph', icon: Waypoints },
    { id: 'tasks', label: 'Tasks', icon: ListChecks },
  ] as const
  const tree = $derived.by(() => {
    const root = folder('', '')
    for (const note of workspace.notes) {
      let branch = root
      for (const part of note.path.split('/').slice(0, -1)) {
        let child = branch.folders.get(part)
        if (!child) { child = folder([branch.path, part].filter(Boolean).join('/'), part); branch.folders.set(part, child) }
        branch = child
      }
      branch.files.push(note)
    }
    return root
  })

  function clearPeek() { clearTimeout(timer); pending = undefined; peek = undefined }

  async function fileActions(event: MouseEvent, path: string) {
    event.preventDefault(); clearPeek()
    const anchor = event.currentTarget as HTMLElement
    const rect = anchor.getBoundingClientRect()
    const pointer = event.type === 'contextmenu' && (event.clientX !== 0 || event.clientY !== 0)
    fileMenu = { path, anchor, x: Math.max(8, Math.min(pointer ? event.clientX : rect.right - 162, window.innerWidth - 196)), y: Math.max(8, Math.min(pointer ? event.clientY : rect.bottom + 4, window.innerHeight - 88)) }
    await tick(); menuButton?.focus({ preventScroll: true })
  }

  function dismissMenu(event?: PointerEvent) {
    if (!(event?.target instanceof Element) || !event.target.closest('.file-menu')) fileMenu = undefined
  }

  function toggleFolder(path: string, event: MouseEvent) {
    instant = event.detail === 0 ? path : ''
    if (closed.has(path)) closed.delete(path)
    else closed.add(path)
  }

  function beginPeek(event: PointerEvent, path: string) {
    clearPeek()
    if (fileMenu) return
    if (event.pointerType === 'touch' || !matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const row = (event.currentTarget as HTMLElement).getBoundingClientRect()
    pending = path
    timer = setTimeout(async () => {
      try {
        const content = await workspace.read(path)
        if (pending !== path) return
        peek = { path, x: Math.max(11, Math.min(row.right + 10, window.innerWidth - 309)), y: Math.max(49, Math.min(row.top - 7, window.innerHeight - 211)), html: hoverExcerpt(content) }
      } catch { /* Opening the file directly shows a recovery message. */ }
    }, 360)
  }

  $effect(() => { workspace.info?.key; return clearPeek })
  $effect(() => { if (!visible) { clearPeek(); dismissMenu() } })
</script>

<svelte:window onpointerdown={dismissMenu} onresize={() => dismissMenu()} onkeydown={(event) => {
  if (event.key === 'Escape' && fileMenu) { event.preventDefault(); fileMenu.anchor.focus({ preventScroll: true }); dismissMenu() }
}} />

{#snippet rows(branch: FolderNode, depth: number)}
  {#each [...branch.folders.values()].sort((a, b) => a.name.localeCompare(b.name)) as group (group.path)}
    <button type="button" class="side-row tree-row folder-row" class:instant={instant === group.path} aria-expanded={!closed.has(group.path)} style:--depth={depth}
      onclick={(event) => toggleFolder(group.path, event)}>
      <ChevronRight class="folder-chevron" size={12} strokeWidth={1.7} />
      {#if closed.has(group.path)}<Folder size={16} strokeWidth={1.6} />{:else}<FolderOpen size={16} strokeWidth={1.6} />{/if}
      <span>{group.name}</span>
    </button>
    <div class="folder-reveal" class:collapsed={closed.has(group.path)} class:instant={instant === group.path} inert={closed.has(group.path)}>
      <div class="folder-contents">{@render rows(group, depth + 1)}</div>
    </div>
  {/each}
  {#each branch.files as note (note.path)}
    <div class="note-entry">
    <button type="button" class="side-row tree-row note-row" class:selected={workspace.page === 'note' && workspace.activePath === note.path}
      style:--depth={depth} aria-current={workspace.page === 'note' && workspace.activePath === note.path ? 'page' : undefined} onpointerenter={(event) => beginPeek(event, note.path)} onpointerleave={clearPeek}
       oncontextmenu={(event) => void fileActions(event, note.path)}
       onclick={() => { clearPeek(); void workspace.open(note.path) }}><FileText size={16} strokeWidth={1.6} /><span>{noteName(note.path)}</span></button>
    <button type="button" class="icon-button note-actions" aria-label={`Actions for ${noteName(note.path)}`} aria-expanded={fileMenu?.path === note.path} onpointerenter={clearPeek} onclick={(event) => void fileActions(event, note.path)}><Ellipsis size={16} /></button>
    </div>
  {/each}
{/snippet}

<aside class="sidebar" id="workspace-sidebar" aria-label="Workspace sidebar">
  <nav class="sidebar-nav" aria-label="Workspace">
    {#each destinations as destination (destination.id)}
      <button type="button" class="side-row" class:selected={workspace.page === destination.id} aria-current={workspace.page === destination.id ? 'page' : undefined} onclick={() => { workspace.show(destination.id); if (destination.id === 'inbox') void workspace.refreshInbox() }}><destination.icon size={17} strokeWidth={1.65} /><span>{destination.label}</span>{#if destination.id === 'inbox' && workspace.inbox.length}<span class="sidebar-count" aria-label={`${workspace.inbox.length} notes`}>{workspace.inbox.length}</span>{/if}</button>
      {#if destination.id === 'home'}<button type="button" class="side-row" class:selected={workspace.page === 'today'} aria-current={workspace.page === 'today' ? 'page' : undefined} data-tooltip="Open Today" data-tooltip-key={displayShortcut(keys.today)} disabled={workspace.busy} onclick={() => void workspace.today()}><CalendarDays size={17} strokeWidth={1.65} /><span>Today</span></button>{/if}
    {/each}
  </nav>
  <div class="side-section">
    <span data-tooltip={workspace.info?.sample ? undefined : workspace.info?.name}>{workspace.info?.sample ? 'Files' : workspace.info?.name ?? 'Files'}</span>
    <div class="file-actions">
      <button type="button" class="icon-button" aria-label="New from template" data-tooltip="New from template" data-tooltip-key={displayShortcut(keys.template)} disabled={workspace.busy} onclick={templates}><LayoutTemplate size={16} strokeWidth={1.6} /></button>
      <button type="button" class="icon-button" aria-label="Open folder" data-tooltip="Open folder…" disabled={workspace.busy} onclick={() => void workspace.chooseFolder()}><FolderOpen size={16} strokeWidth={1.6} /></button>
      <button class="icon-button" type="button" aria-label="New note" data-tooltip="New note" data-tooltip-key={displayShortcut(keys.newNote)} disabled={workspace.busy} onclick={() => void workspace.create()}><Plus size={17} strokeWidth={1.6} /></button>
    </div>
  </div>
  <div class="file-tree" onscroll={() => { clearPeek(); dismissMenu() }}>
    {@render rows(tree, 0)}
    {#if !workspace.notes.length}<p>{workspace.busy ? 'Opening folder…' : 'No Markdown files'}</p>{/if}
  </div>
  <div class="sidebar-footer">
    <button type="button" class="side-row" class:selected={workspace.page === 'trash'} aria-current={workspace.page === 'trash' ? 'page' : undefined} data-tooltip-key={displayShortcut(keys.trash)} data-tooltip="Trash" onclick={() => { workspace.show('trash'); void workspace.refreshTrash() }}><Trash2 size={17} strokeWidth={1.6} /><span>Trash</span></button>
    <button type="button" class="side-row" class:selected={workspace.page === 'settings'} aria-current={workspace.page === 'settings' ? 'page' : undefined} data-tooltip="Settings" data-tooltip-key={displayShortcut(keys.settings)} onclick={() => workspace.show('settings')}><Settings2 size={17} strokeWidth={1.65} /><span>Settings</span></button>
  </div>
</aside>

{#if peek}
  <div class="note-peek" role="tooltip" style:left="{peek.x}px" style:top="{peek.y}px">
    <header><FileText size={14} strokeWidth={1.55} /><span>{noteName(peek.path)}</span></header>
    {#if peek.html}<div class="prose peek-copy">{@html peek.html}</div>{:else}<p>This note is empty.</p>{/if}
  </div>
{/if}

{#if fileMenu}
  <div class="file-menu" role="group" aria-label="File actions" style:left="{fileMenu.x}px" style:top="{fileMenu.y}px">
    <button type="button" bind:this={menuButton} disabled={workspace.trashBusy || workspace.busy} onclick={() => { const path = fileMenu?.path; dismissMenu(); if (path) move(path) }}><Pencil size={15} strokeWidth={1.65} /> Rename or move…</button>
    <button type="button" disabled={workspace.trashBusy || workspace.busy} onclick={() => { const path = fileMenu?.path; dismissMenu(); if (path) void workspace.moveToTrash(path) }}><Trash2 size={15} strokeWidth={1.65} /> Move to Trash</button>
  </div>
{/if}
