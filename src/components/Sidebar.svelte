<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity'
  import { CheckSquare, ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Plus, Search } from '@lucide/svelte'
  import { noteName, type Note } from '../lib/notes.ts'
  import { hoverExcerpt } from '../lib/markdown.ts'
  import type { Workspace } from '../lib/workspace.svelte.ts'

  let { workspace }: { workspace: Workspace } = $props()
  type FolderNode = { path: string; name: string; folders: Map<string, FolderNode>; files: Note[] }
  let closed = new SvelteSet<string>()
  let peek = $state<{ path: string; y: number; x: number; html: string }>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: string | undefined
  const folder = (path: string, name: string): FolderNode => ({ path, name, folders: new Map(), files: [] })
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

  function beginPeek(event: PointerEvent, path: string) {
    clearPeek()
    if (event.pointerType === 'touch' || !matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const row = (event.currentTarget as HTMLElement).getBoundingClientRect()
    pending = path
    timer = setTimeout(async () => {
      try {
        const content = await workspace.read(path)
        if (pending !== path) return
        peek = { path, x: Math.max(11, Math.min(row.right + 9, window.innerWidth - 309)), y: Math.max(47, Math.min(row.top - 7, window.innerHeight - 211)), html: hoverExcerpt(content) }
      } catch { /* Opening the file directly shows a recovery message. */ }
    }, 360)
  }

  $effect(() => { workspace.info?.key; return clearPeek })
</script>

{#snippet rows(branch: FolderNode, depth: number)}
  {#each [...branch.folders.values()].sort((a, b) => a.name.localeCompare(b.name)) as group (group.path)}
    <button type="button" class="side-row tree-row" aria-expanded={!closed.has(group.path)} style:--depth={depth}
      onclick={() => { if (closed.has(group.path)) closed.delete(group.path); else closed.add(group.path) }}>
      {#if closed.has(group.path)}<ChevronRight size={13} /><Folder size={15} />{:else}<ChevronDown size={13} /><FolderOpen size={15} />{/if}<span>{group.name}</span>
    </button>
    {#if !closed.has(group.path)}{@render rows(group, depth + 1)}{/if}
  {/each}
  {#each branch.files as note (note.path)}
    <button type="button" class="side-row tree-row note-row" class:selected={workspace.page === 'note' && workspace.activePath === note.path}
      style:--depth={depth} aria-current={workspace.page === 'note' && workspace.activePath === note.path ? 'page' : undefined} onpointerenter={(event) => beginPeek(event, note.path)} onpointerleave={clearPeek}
      onclick={() => { clearPeek(); void workspace.open(note.path) }}><FileText size={15} /><span>{noteName(note.path)}</span></button>
  {/each}
{/snippet}

<aside class="sidebar" aria-label="Workspace sidebar">
  <div class="side-section"><span title={workspace.info?.sample ? undefined : workspace.info?.name}>{workspace.info?.sample ? 'Files' : workspace.info?.name ?? 'Files'}</span><button class="icon-button" type="button" aria-label="New note" title="New note" disabled={workspace.busy} onclick={() => void workspace.create()}><Plus size={15} /></button></div>
  <div class="file-tree" onscroll={clearPeek}>
    {@render rows(tree, 0)}
    {#if !workspace.notes.length}<p>{workspace.busy ? 'Opening folder…' : 'No Markdown files'}</p>{/if}
  </div>
  <div class="sidebar-footer">
    <button type="button" class="side-row" class:selected={workspace.page === 'tasks'} onclick={() => workspace.show('tasks')}><CheckSquare size={15} /><span>Tasks</span></button>
    <button type="button" class="icon-button" aria-label="Open folder" title="Open folder…" disabled={workspace.busy} onclick={() => void workspace.chooseFolder()}><FolderOpen size={16} /></button>
  </div>
</aside>

{#if peek}
  <div class="note-peek" role="tooltip" style:left="{peek.x}px" style:top="{peek.y}px">
    <header><FileText size={14} /><span>{noteName(peek.path)}</span></header>
    {#if peek.html}<div class="prose peek-copy">{@html peek.html}</div>{:else}<p>This note is empty.</p>{/if}
  </div>
{/if}
