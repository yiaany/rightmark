<script lang="ts">
  import { onMount } from 'svelte'
  import { CircleAlert, X } from '@lucide/svelte'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import DocumentPane from './components/DocumentPane.svelte'
  import Home from './components/Home.svelte'
  import SearchDialog from './components/SearchDialog.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import Tasks from './components/Tasks.svelte'
  import TitleBar from './components/TitleBar.svelte'
  import { noteName } from './lib/notes.ts'
  import { native } from './lib/storage.ts'
  import { Workspace, type Mode } from './lib/workspace.svelte.ts'

  const workspace = new Workspace()
  let sidebar = $state(true)
  let searchDialog: SearchDialog
  let note = $derived(workspace.page === 'note' ? workspace.active : undefined)
  let storageError = $derived([...workspace.sessions.values()].find((session) => session.error))
  let wordCount = $derived(note?.text.match(/\S+/g)?.length ?? 0)

  onMount(() => {
    void workspace.start()
    if (matchMedia('(max-width: 700px)').matches) sidebar = false
    const close = native ? getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault()
      if (await workspace.flush()) await getCurrentWindow().destroy()
      else workspace.error = 'Some changes were not saved. Copy your edits before closing.'
    }).catch((error: unknown) => { console.error(error); return undefined }) : undefined
    return () => { void close?.then((unlisten) => unlisten?.()) }
  })

  function search() { searchDialog.show() }
  function shortcuts(event: KeyboardEvent) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.isComposing || event.defaultPrevented) return
    const key = event.key.toLowerCase()
    if (key === 'k') { event.preventDefault(); search() }
    else if (key === 'n') { event.preventDefault(); void workspace.create() }
    else if (key === 's') { event.preventDefault(); if (note) void workspace.save(note) }
    else if (key === 'w' && native && note) { event.preventDefault(); void workspace.close(note.path) }
    else if (key === 'b' && event.shiftKey) { event.preventDefault(); sidebar = !sidebar }
    else if (key === 'g' && event.shiftKey) { event.preventDefault(); workspace.show('graph') }
    else if (note && ['1', '2', '3'].includes(key)) {
      event.preventDefault(); note.syncView?.(); note.mode = (['editor', 'split', 'preview'] as Mode[])[Number(key) - 1]
    }
  }
</script>

<svelte:window onkeydown={shortcuts} />
<div class="app-shell" class:native>
  <TitleBar {workspace} {sidebar} toggleSidebar={() => { sidebar = !sidebar }} {search} />
  <div class="workspace-shell" class:with-sidebar={sidebar}>
    {#if sidebar}<Sidebar {workspace} />{/if}
    <main aria-label={note ? noteName(note.path) : workspace.page === 'graph' ? 'Graph' : workspace.page === 'tasks' ? 'Tasks' : 'Home'}>
      {#if workspace.error || storageError}
        <div class="app-error" role="alert"><CircleAlert size={15} /><span>{workspace.error || storageError?.error}</span>
          {#if workspace.error}<button type="button" aria-label="Dismiss message" onclick={() => { workspace.error = '' }}><X size={14} /></button>{/if}
        </div>
      {/if}
      {#if note}
        {#key note.path}
          {@const session = note}
          <DocumentPane document={session} onChange={(text) => workspace.update(session, text)} onLink={(target) => workspace.follow(target, session.path)} />
        {/key}
      {:else if workspace.page === 'tasks'}<Tasks {workspace} />
      {:else if workspace.page === 'graph'}
        {#await import('./components/Graph.svelte') then { default: Graph }}<Graph {workspace} />{:catch}<p class="pane-message">Could not open the graph.</p>{/await}
      {:else}<Home {workspace} />{/if}
      {#if note}
        <footer class="statusbar">
          <span>Markdown</span><div></div>
          <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
          <span aria-live="polite">{#if note.error}<CircleAlert size={13} />Not saved{:else if note.saved !== note.text}Saving…{:else}Saved{/if}</span>
        </footer>
      {/if}
    </main>
  </div>
</div>
<SearchDialog {workspace} bind:this={searchDialog} />
