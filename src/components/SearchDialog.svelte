<script lang="ts">
  import { tick } from 'svelte'
  import { FileText, Search, X } from '@lucide/svelte'
  import { noteFolder, noteName, searchNotes, type SearchResult } from '../lib/notes.ts'
  import type { Workspace } from '../lib/workspace.svelte.ts'

  let { workspace }: { workspace: Workspace } = $props()
  let dialog: HTMLDialogElement
  let input: HTMLInputElement
  let list: HTMLDivElement
  let query = $state('')
  let selected = $state('')
  let open = $state(false)
  const batch = 80
  let limit = $state(batch)
  let results = $derived.by(() => {
    if (!open) return []
    workspace.indexVersion
    const order = new Map(workspace.recent.map((path, index) => [path, index]))
    const notes = query.trim() ? workspace.notes : [...workspace.notes].sort((a, b) => (order.get(a.path) ?? Infinity) - (order.get(b.path) ?? Infinity))
    return searchNotes(notes, (path) => workspace.sessions.get(path)?.text ?? workspace.index.get(path), query)
  })
  let visible = $derived(results.slice(0, limit))
  let index = $derived(Math.max(0, visible.findIndex(({ path }) => path === selected)))

  export function show() {
    if (dialog.open) return
    workspace.active?.syncView?.()
    query = ''; selected = ''; limit = batch; open = true
    dialog.showModal()
    list.scrollTop = 0
    input.focus()
  }

  function choose(note: SearchResult) { dialog.close(); void workspace.open(note.path, true, note.match) }

  function keys(event: KeyboardEvent) {
    if (!visible.length || event.isComposing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = Math.max(0, Math.min(results.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))
      if (next >= limit) limit += batch
      selected = results[next].path
      void tick().then(() => list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }))
    } else if (event.key === 'Enter') { event.preventDefault(); if (visible[index]) choose(visible[index]) }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<dialog class="search-dialog" aria-label="Search notes" bind:this={dialog} onclose={() => { if (!dialog.open) open = false }} onclick={(event) => { if (event.target === dialog) dialog.close() }}>
  <div class="search-input">
    <Search size={20} />
    <input bind:this={input} bind:value={query} oninput={() => { selected = ''; limit = batch; list.scrollTop = 0 }} onkeydown={keys} maxlength="512" spellcheck={false} autocorrect="off" autocapitalize="off" autocomplete="off"
      aria-label="Search notes" placeholder="Search notes, folders, or text…" role="combobox" aria-expanded={open} aria-controls="search-results" aria-activedescendant={visible[index] ? `result-${index}` : undefined} />
    <button type="button" class="icon-button" aria-label="Close search" onclick={() => dialog.close()}><X size={16} /></button>
  </div>
  <div class="search-section" aria-live="polite">{query.trim() ? `${results.length} ${results.length === 1 ? 'result' : 'results'}` : 'Notes · recent first'}</div>
  <div class="search-results" id="search-results" role="listbox" aria-label="Search results" bind:this={list} onscroll={() => {
    if (results.length > limit && list.scrollHeight - list.scrollTop - list.clientHeight < 160) limit += batch
  }}>
    {#each visible as note, row (note.path)}
      <button type="button" role="option" tabindex="-1" id={`result-${row}`} aria-selected={row === index} onpointermove={() => { selected = note.path }} onclick={() => choose(note)}>
        <FileText size={17} strokeWidth={1.6} />
        <span class="search-result-copy"><span class="search-result-title"><strong>{noteName(note.path)}</strong><small>{noteFolder(note.path) || 'Workspace'}</small></span>
          {#if note.excerpt}<span class="search-excerpt">{note.excerpt.before}<mark>{note.excerpt.match}</mark>{note.excerpt.after}</span>{/if}
        </span>
      </button>
    {:else}<p>{workspace.busy || workspace.indexing ? 'Reading files…' : query.trim() ? 'No matching notes.' : 'No Markdown files in this folder.'}</p>{/each}
  </div>
  <div class="search-footer"><span><kbd>↑</kbd> <kbd>↓</kbd> Move</span><span><kbd>↵</kbd> Open</span><span><kbd>Esc</kbd> Close</span>{#if workspace.indexing}<span class="search-indexing">Indexing…</span>{/if}</div>
</dialog>
