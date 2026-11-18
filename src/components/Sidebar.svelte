<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity'
  import { ChevronRight, FileText, Folder, FolderOpen, House, ListChecks, Plus, Settings2, Waypoints } from '@lucide/svelte'
  import { noteName, type Note } from '../lib/notes.ts'
  import { hoverExcerpt } from '../lib/markdown.ts'
  import type { Workspace } from '../lib/workspace.svelte.ts'

  let { workspace, visible }: { workspace: Workspace; visible: boolean } = $props()
  type FolderNode = { path: string; name: string; folders: Map<string, FolderNode>; files: Note[] }
  let closed = new SvelteSet<string>()
  let instant = $state('')
  let peek = $state<{ path: string; y: number; x: number; html: string }>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: string | undefined
  const folder = (path: string, name: string): FolderNode => ({ path, name, folders: new Map(), files: [] })
  const destinations = [
    { id: 'home', label: 'Home', icon: House },
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

  function toggleFolder(path: string, event: MouseEvent) {
    instant = event.detail === 0 ? path : ''
    if (closed.has(path)) closed.delete(path)
    else closed.add(path)
  }

  function beginPeek(event: PointerEvent, path: string) {
    clearPeek()
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
  $effect(() => { if (!visible) clearPeek() })
</script>

{#snippet rows(branch: FolderNode, depth: number)}
  {#each [...branch.folders.values()].sort((a, b) => a.name.localeCompare(b.name)) as group (group.path)}
    <button type="button" class="side-row tree-row folder-row" class:instant={instant === group.path} aria-expanded={!closed.has(group.path)} style:--depth={depth}
      onclick={(event) => toggleFolder(group.path, event)}>
      <ChevronRight class="folder-chevron" size={11} strokeWidth={1.7} />
      {#if closed.has(group.path)}<Folder size={15} strokeWidth={1.55} />{:else}<FolderOpen size={15} strokeWidth={1.55} />{/if}
      <span>{group.name}</span>
    </button>
    <div class="folder-reveal" class:collapsed={closed.has(group.path)} class:instant={instant === group.path} inert={closed.has(group.path)}>
      <div class="folder-contents">{@render rows(group, depth + 1)}</div>
    </div>
  {/each}
  {#each branch.files as note (note.path)}
    <button type="button" class="side-row tree-row note-row" class:selected={workspace.page === 'note' && workspace.activePath === note.path}
      style:--depth={depth} aria-current={workspace.page === 'note' && workspace.activePath === note.path ? 'page' : undefined} onpointerenter={(event) => beginPeek(event, note.path)} onpointerleave={clearPeek}
       onclick={() => { clearPeek(); void workspace.open(note.path) }}><FileText size={14} strokeWidth={1.55} /><span>{noteName(note.path)}</span></button>
  {/each}
{/snippet}

<aside class="sidebar" id="workspace-sidebar" aria-label="Workspace sidebar">
  <nav class="sidebar-nav" aria-label="Workspace">
    {#each destinations as destination (destination.id)}
      <button type="button" class="side-row" class:selected={workspace.page === destination.id} aria-current={workspace.page === destination.id ? 'page' : undefined} onclick={() => workspace.show(destination.id)}><destination.icon size={15} strokeWidth={1.55} /><span>{destination.label}</span></button>
    {/each}
  </nav>
  <div class="side-section">
    <span title={workspace.info?.sample ? undefined : workspace.info?.name}>{workspace.info?.sample ? 'Files' : workspace.info?.name ?? 'Files'}</span>
    <div class="file-actions">
      <button type="button" class="icon-button" aria-label="Open folder" title="Open folder…" disabled={workspace.busy} onclick={() => void workspace.chooseFolder()}><FolderOpen size={14} strokeWidth={1.55} /></button>
      <button class="icon-button" type="button" aria-label="New note" title="New note" disabled={workspace.busy} onclick={() => void workspace.create()}><Plus size={15} strokeWidth={1.55} /></button>
    </div>
  </div>
  <div class="file-tree" onscroll={clearPeek}>
    {@render rows(tree, 0)}
    {#if !workspace.notes.length}<p>{workspace.busy ? 'Opening folder…' : 'No Markdown files'}</p>{/if}
  </div>
  <div class="sidebar-footer">
    <button type="button" class="side-row" class:selected={workspace.page === 'settings'} aria-current={workspace.page === 'settings' ? 'page' : undefined} title="Settings (⌘,)" onclick={() => workspace.show('settings')}><Settings2 size={15} strokeWidth={1.6} /><span>Settings</span></button>
  </div>
</aside>

{#if peek}
  <div class="note-peek" role="tooltip" style:left="{peek.x}px" style:top="{peek.y}px">
    <header><FileText size={14} strokeWidth={1.55} /><span>{noteName(peek.path)}</span></header>
    {#if peek.html}<div class="prose peek-copy">{@html peek.html}</div>{:else}<p>This note is empty.</p>{/if}
  </div>
{/if}
