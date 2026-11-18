<script lang="ts">
  import { tick } from 'svelte'
  import { FileText, Search } from '@lucide/svelte'
  import { noteFolder, noteName, searchNotes } from '../lib/notes.ts'
  import type { Workspace } from '../lib/workspace.svelte.ts'

  let { workspace }: { workspace: Workspace } = $props()
  let dialog: HTMLDialogElement
  let input: HTMLInputElement
  let query = $state('')
  let index = $state(0)
  let open = $state(false)
  let results = $derived.by(() => {
    if (!open) return []
    workspace.indexVersion
    return searchNotes(workspace.notes, (path) => workspace.sessions.get(path)?.text ?? workspace.index.get(path), query)
  })

  export function show() {
    if (dialog.open) return
    query = ''; index = 0; open = true
    dialog.showModal()
    input.focus()
  }

  function choose(path: string) { dialog.close(); void workspace.open(path) }

  function keys(event: KeyboardEvent) {
    if (!results.length || event.isComposing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      index = (index + (event.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length
      void tick().then(() => document.getElementById(`result-${index}`)?.scrollIntoView({ block: 'nearest' }))
    } else if (event.key === 'Enter') { event.preventDefault(); if (results[index]) choose(results[index].path) }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<dialog class="search-dialog" aria-label="Search notes" bind:this={dialog} onclose={() => { open = false }} onclick={(event) => { if (event.target === dialog) dialog.close() }}>
  <div class="search-input">
    <Search size={20} />
    <input bind:this={input} bind:value={query} oninput={() => { index = 0 }} onkeydown={keys}
      aria-label="Search notes" placeholder="Search titles or text…" role="combobox" aria-expanded={open} aria-controls="search-results" aria-activedescendant={results[index] ? `result-${index}` : undefined} />
    <button type="button" title="Close search" aria-label="Close search" onclick={() => dialog.close()}><kbd>Esc</kbd></button>
  </div>
  <div class="search-results" id="search-results" role="listbox" aria-label="Search results">
    {#each results as note, row (note.path)}
      <button type="button" role="option" id={`result-${row}`} aria-selected={row === index} onpointermove={() => { index = row }} onclick={() => choose(note.path)}>
        <FileText size={17} /><span><strong>{noteName(note.path)}</strong><small>{note.excerpt || noteFolder(note.path) || 'Workspace'}</small></span>
      </button>
    {:else}<p>{workspace.indexing ? 'Reading files…' : 'No matching notes'}</p>{/each}
  </div>
  <div class="search-footer"><span><kbd>↑</kbd> <kbd>↓</kbd> Move</span><span><kbd>↵</kbd> Open</span>{#if workspace.indexing}<span class="search-indexing">Indexing…</span>{/if}</div>
</dialog>
