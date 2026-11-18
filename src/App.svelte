<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { CircleAlert, X } from '@lucide/svelte'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import DocumentPane from './components/DocumentPane.svelte'
  import Home from './components/Home.svelte'
  import SearchDialog from './components/SearchDialog.svelte'
  import Settings from './components/Settings.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import Tasks from './components/Tasks.svelte'
  import TitleBar from './components/TitleBar.svelte'
  import { noteName } from './lib/notes.ts'
  import { native } from './lib/storage.ts'
  import { effectiveTheme, saveTheme, type Theme } from './lib/appearance.ts'
  import { Workspace, type Mode } from './lib/workspace.svelte.ts'

  let { initialTheme }: { initialTheme: Theme } = $props()
  const workspace = new Workspace()
  let theme = $state<Theme>(untrack(() => initialTheme))
  let sidebar = $state(true)
  let animateSidebar = $state(false)
  let searchDialog: SearchDialog
  let note = $derived(workspace.page === 'note' ? workspace.active : undefined)
  let storageError = $derived([...workspace.sessions.values()].find((session) => session.error))

  onMount(() => {
    void workspace.start()
    if (matchMedia('(max-width: 700px)').matches) sidebar = false
    const close = native ? getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault()
      if (await workspace.flush()) await getCurrentWindow().destroy()
      else workspace.error = 'Some changes were not saved. Copy your edits before closing.'
    }).catch((error: unknown) => { console.error(error); return undefined }) : undefined
    const system = matchMedia('(prefers-color-scheme: dark)')
    const onSystemChange = () => { if (theme === 'system') refreshTheme(system.matches) }
    system.addEventListener('change', onSystemChange)
    if (native) applyWindowTheme()
    return () => { system.removeEventListener('change', onSystemChange); void close?.then((unlisten) => unlisten?.()) }
  })

  function refreshTheme(systemDark = matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.dataset.theme = effectiveTheme(theme, systemDark)
  }

  function applyWindowTheme() {
    const preference = theme
    void getCurrentWindow().setTheme(preference === 'system' ? null : preference).then(() => {
      if (theme === preference) refreshTheme()
    }).catch(console.error)
  }

  function changeTheme(next: Theme) {
    theme = next
    refreshTheme()
    saveTheme(next)
    if (native) applyWindowTheme()
  }

  function search() { searchDialog.show() }
  function toggleSidebar(animate: boolean) { animateSidebar = animate; sidebar = !sidebar }

  function shortcuts(event: KeyboardEvent) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.isComposing || event.defaultPrevented) return
    const key = event.key.toLowerCase()
    if (key === 'k') { event.preventDefault(); search() }
    else if (key === 'n') { event.preventDefault(); void workspace.create() }
    else if (key === 's') { event.preventDefault(); if (note) void workspace.save(note) }
    else if (key === 'w' && native && note) { event.preventDefault(); void workspace.close(note.path) }
    else if (key === 'b' && event.shiftKey) { event.preventDefault(); toggleSidebar(false) }
    else if (key === 'g' && event.shiftKey) { event.preventDefault(); workspace.show('graph') }
    else if (key === ',') { event.preventDefault(); workspace.show('settings') }
    else if (note && ['1', '2', '3'].includes(key)) {
      event.preventDefault(); note.syncView?.(); note.mode = (['editor', 'split', 'preview'] as Mode[])[Number(key) - 1]
    }
  }
</script>

<svelte:window onkeydown={shortcuts} />
<div class="app-shell" class:native>
  <TitleBar {workspace} {sidebar} {toggleSidebar} {search} {theme} onTheme={changeTheme} />
  <div class="workspace-shell" class:with-sidebar={sidebar} class:animate-sidebar={animateSidebar}>
    <div class="sidebar-slot" inert={!sidebar}><Sidebar {workspace} visible={sidebar} /></div>
    <main class="workspace-panel" class:document-panel={!!note} aria-label={note ? noteName(note.path) : { graph: 'Graph', tasks: 'Tasks', home: 'Home', settings: 'Settings', note: 'Note' }[workspace.page]}>
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
      {:else if workspace.page === 'settings'}<Settings {workspace} {theme} onTheme={changeTheme} />
      {:else if workspace.page === 'graph'}
        {#await import('./components/Graph.svelte') then { default: Graph }}<Graph {workspace} />{:catch}<p class="pane-message">Could not open the graph.</p>{/await}
      {:else}<Home {workspace} />{/if}
    </main>
  </div>
</div>
<SearchDialog {workspace} bind:this={searchDialog} />
