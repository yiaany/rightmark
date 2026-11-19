<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import { CircleAlert, X } from '@lucide/svelte'
  import { listen } from '@tauri-apps/api/event'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import CaptureEditor from './components/CaptureEditor.svelte'
  import ConflictDialog from './components/ConflictDialog.svelte'
  import DocumentPane from './components/DocumentPane.svelte'
  import EmojiPicker from './components/EmojiPicker.svelte'
  import Home from './components/Home.svelte'
  import Inbox from './components/Inbox.svelte'
  import NoteDialog from './components/NoteDialog.svelte'
  import Outline from './components/Outline.svelte'
  import SearchDialog from './components/SearchDialog.svelte'
  import Settings from './components/Settings.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import Tasks from './components/Tasks.svelte'
  import TitleBar from './components/TitleBar.svelte'
  import Today from './components/Today.svelte'
  import Trash from './components/Trash.svelte'
  import { noteName } from './lib/notes.ts'
  import { getCaptureShortcut, native, quitFolio, setCaptureShortcut, showCapture, type Draft } from './lib/storage.ts'
  import { imageTypes } from './lib/attachments.ts'
  import { captureDefault, type CaptureShortcut } from './lib/inbox.ts'
  import { effectiveTheme, readCaptureButton, saveCaptureButton, saveTheme, type Theme } from './lib/appearance.ts'
  import { Workspace, type DocumentSession, type Mode } from './lib/workspace.svelte.ts'
  import { defaults, displayShortcut, keyboardChord, readBindings, saveBindings, shortcutIssue, type Command } from './lib/shortcuts.ts'

  let { initialTheme }: { initialTheme: Theme } = $props()
  const workspace = new Workspace()
  let theme = $state<Theme>(untrack(() => initialTheme))
  let appliedTheme = $state<'light' | 'dark'>(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
  let sidebar = $state(true)
  let animateSidebar = $state(false)
  let searchDialog: SearchDialog
  let captureDialog = $state<HTMLDialogElement>()
  let inlineCapture = $state(false)
  let captureButton = $state(readCaptureButton())
  let keys = $state(readBindings())
  let shortcut = $state<CaptureShortcut>({ shortcut: captureDefault, error: null })
  let note = $derived(workspace.page === 'note' ? workspace.active : undefined)
  let current = $derived(workspace.currentDocument)
  let emojiTarget = $state.raw<DocumentSession>()
  let outlineTarget = $state.raw<DocumentSession>()
  let conflictTarget = $state.raw<DocumentSession | Draft>()
  let attachmentInput: HTMLInputElement
  let imageTarget: DocumentSession | undefined
  let storageError = $derived([...workspace.sessions.values()].find((session) => session.error || session.recoveryError))
  let needsReview = $derived(current?.conflict ? current : [...workspace.sessions.values()].find((session) => session.conflict) ?? workspace.detachedDrafts[0])
  let noteDialog = $state<{ kind: 'move' | 'history' | 'template'; path?: string }>()
  const templates = () => { noteDialog = { kind: 'template' } }
  const move = (path: string) => { noteDialog = { kind: 'move', path } }
  const history = (path: string) => { noteDialog = { kind: 'history', path } }
  function openOutline() { if (current?.jumpOutline) { current.syncView?.(); outlineTarget = current } }
  async function jumpHeading(ordinal: number, line: number) {
    const target = outlineTarget
    outlineTarget = undefined
    await tick()
    if (target === workspace.currentDocument) target?.jumpOutline?.(ordinal, line)
  }
  function pickImages() { if (current?.insertImages) { imageTarget = current; attachmentInput.click() } }
  function chosenImages(event: Event & { currentTarget: HTMLInputElement }) {
    const files = [...(event.currentTarget.files ?? [])]
    if (files.length && imageTarget === workspace.currentDocument) imageTarget?.insertImages?.(files)
    imageTarget = undefined; event.currentTarget.value = ''
  }
  function remember() { workspace.currentDocument?.syncView?.(); workspace.remember() }
  function preventFileNavigation(event: DragEvent) {
    // A drop outside an editor must not replace the app window with a file URL.
    if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
  }

  $effect(() => {
    workspace.tabs; workspace.page; workspace.activePath; workspace.dailyDate; current?.mode; workspace.busy
    untrack(() => workspace.remember())
  })

  function openEmoji() { if (current?.insertEmoji) emojiTarget = current }
  async function chooseEmoji(value: string) {
    const target = emojiTarget
    emojiTarget = undefined
    await tick()
    if (target === workspace.currentDocument) target?.insertEmoji?.(value)
  }

  onMount(() => {
    void workspace.start()
    if (matchMedia('(max-width: 700px)').matches) sidebar = false
    const close = native ? getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault()
      if (await workspace.persistForExit()) await getCurrentWindow().hide()
      else workspace.error = 'Some changes were not saved. Copy your edits before closing.'
    }).catch((error: unknown) => { console.error(error); return undefined }) : undefined
    const system = matchMedia('(prefers-color-scheme: dark)')
    const onSystemChange = () => { if (theme === 'system') refreshTheme(system.matches) }
    system.addEventListener('change', onSystemChange)
    const listeners = native ? [
      listen('folio-inbox-changed', () => void workspace.captured()),
      listen('folio-quit', async () => {
        if (await workspace.persistForExit()) await quitFolio()
        else workspace.error = 'Some changes were not saved. Copy your edits before quitting.'
      }),
    ] : []
    const focus = () => void workspace.checkExternal(true)
    const visibility = () => { if (document.hidden) remember(); else focus() }
    const pulse = setInterval(() => { if (!document.hidden && document.hasFocus()) { workspace.remember(); void workspace.checkExternal() } }, 2000)
    window.addEventListener('focus', focus)
    window.addEventListener('pagehide', remember)
    document.addEventListener('visibilitychange', visibility)
    if (native) {
      applyWindowTheme()
      void getCaptureShortcut().then((value) => { shortcut = value; keys = { ...keys, capture: value.shortcut } }).catch(console.error)
    }
    return () => {
      clearInterval(pulse)
      window.removeEventListener('focus', focus)
      window.removeEventListener('pagehide', remember)
      document.removeEventListener('visibilitychange', visibility)
      system.removeEventListener('change', onSystemChange)
      void close?.then((unlisten) => unlisten?.())
      for (const listener of listeners) void listener.then((unlisten) => unlisten()).catch(console.error)
    }
  })

  function refreshTheme(systemDark = matchMedia('(prefers-color-scheme: dark)').matches) {
    appliedTheme = effectiveTheme(theme, systemDark)
    document.documentElement.dataset.theme = appliedTheme
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
  function setCaptureButton(visible: boolean) { captureButton = visible; saveCaptureButton(visible) }
  function capture() {
    if (native) { void showCapture().catch((error) => { workspace.error = String(error) }); return }
    if (captureDialog && !captureDialog.open) { inlineCapture = true; captureDialog.showModal() }
  }
  function dismissInlineCapture() { captureDialog?.close(); inlineCapture = false }
  async function changeShortcut(id: Command, value: string) {
    const issue = shortcutIssue(id, value, keys)
    if (issue) throw new Error(issue)
    if (id === 'capture' && native) shortcut = await setCaptureShortcut(value)
    const next = { ...keys, [id]: value }
    saveBindings(next); keys = next
  }

  async function resetShortcuts() {
    if (native) shortcut = await setCaptureShortcut(defaults.capture)
    const next = { ...defaults }
    saveBindings(next); keys = next
  }
  function toggleSidebar(animate: boolean) { animateSidebar = animate; sidebar = !sidebar }

  function shortcuts(event: KeyboardEvent) {
    if (noteDialog || emojiTarget || outlineTarget || conflictTarget || inlineCapture || searchDialog?.isOpen() || event.defaultPrevented || event.isComposing || event.repeat || (event.target instanceof Element && event.target.closest('[data-shortcut-recorder]'))) return
    const chord = keyboardChord(event)
    const id = chord && (Object.keys(keys) as Command[]).find((action) => keys[action] === chord)
    if (!id || (id === 'capture' && native) || (id === 'closeTab' && (!native || (!note && !workspace.tabs.length)))) return
    if (['source', 'split', 'preview'].includes(id) && !current) return
    event.preventDefault()
    event.stopPropagation()
    switch (id) {
      case 'capture': capture(); break
      case 'search': search(); break
      case 'newNote': void workspace.create(); break
      case 'today': void workspace.today(); break
      case 'template': templates(); break
      case 'save': if (current) void workspace.save(current); break
      case 'closeTab': { const path = note?.path ?? workspace.tabs.at(-1); if (path) void workspace.close(path); break }
      case 'sidebar': toggleSidebar(false); break
      case 'source': case 'split': case 'preview': if (current) { current.syncView?.(); current.mode = (id === 'source' ? 'editor' : id) satisfies Mode }; break
      case 'home': case 'inbox': case 'tasks': case 'graph': case 'settings': case 'trash':
        workspace.show(id); if (id === 'inbox') void workspace.refreshInbox(); if (id === 'trash') void workspace.refreshTrash(); break
    }
  }
</script>

<svelte:window onkeydowncapture={shortcuts} ondragover={preventFileNavigation} ondrop={preventFileNavigation} />
<div class="app-shell" class:native class:with-sidebar={sidebar} class:animate-sidebar={animateSidebar}>
  <TitleBar {workspace} {sidebar} {toggleSidebar} {search} {capture} {captureButton} {history} {openEmoji} {openOutline} {pickImages} {keys} {appliedTheme} onTheme={changeTheme} />
  <div class="workspace-shell">
    <div class="sidebar-slot" inert={!sidebar}><Sidebar {workspace} {keys} {move} {templates} visible={sidebar} /></div>
    <main class="workspace-panel" class:document-panel={!!note || workspace.page === 'today'} aria-label={note ? noteName(note.path) : { graph: 'Graph', tasks: 'Tasks', home: 'Home', today: 'Today', inbox: 'Inbox', settings: 'Settings', note: 'Note', trash: 'Trash' }[workspace.page]}>
      {#if needsReview}
        <div class="recovery-bar" role="status"><CircleAlert size={15} strokeWidth={1.65} /><span>{'conflict' in needsReview ? 'Changes on disk need review.' : 'An unsaved draft is available.'}</span><button type="button" class="button quiet" disabled={workspace.busy} onclick={() => { conflictTarget = needsReview }}>{'conflict' in needsReview ? 'Compare' : 'Review draft'}</button></div>
      {:else if current?.recovered}
        <div class="recovery-bar" role="status"><span>Unsaved edits recovered.</span><button type="button" class="button quiet" onclick={() => { if (current) void workspace.save(current) }}>Save note</button></div>
      {/if}
      {#if workspace.error || storageError}
        <div class="app-error" role="alert"><CircleAlert size={15} /><span>{workspace.error || storageError?.error || storageError?.recoveryError}</span>
          {#if workspace.error}<button type="button" aria-label="Dismiss message" onclick={() => { workspace.error = '' }}><X size={14} /></button>{/if}
        </div>
      {/if}
      {#if note}
        {#key note}
          {@const session = note}
          <div class="document-shell" inert={workspace.editingFiles || workspace.trashingPath === session.path}><DocumentPane document={session} {workspace} onChange={(text) => workspace.update(session, text)} onLink={(target) => void workspace.follow(target, session.path)} /></div>
        {/key}
      {:else if workspace.page === 'today'}<Today {workspace} />
      {:else if workspace.page === 'tasks'}<Tasks {workspace} />
      {:else if workspace.page === 'inbox'}<Inbox {workspace} {capture} shortcut={displayShortcut(keys.capture)} />
      {:else if workspace.page === 'trash'}<Trash {workspace} />
      {:else if workspace.page === 'settings'}<Settings {workspace} {theme} onTheme={changeTheme} {captureButton} {setCaptureButton} {keys} shortcutError={shortcut.error} {changeShortcut} {resetShortcuts} />
      {:else if workspace.page === 'graph'}
        {#await import('./components/Graph.svelte') then { default: Graph }}<Graph {workspace} />{:catch}<p class="pane-message">Could not open the graph.</p>{/await}
      {:else}<Home {workspace} {templates} />{/if}
    </main>
  </div>
</div>
<SearchDialog {workspace} bind:this={searchDialog} />
<input type="file" hidden multiple accept={imageTypes} bind:this={attachmentInput} onchange={chosenImages} />
{#if outlineTarget}<Outline session={outlineTarget} jump={jumpHeading} close={() => { outlineTarget = undefined }} />{/if}
{#if conflictTarget}<ConflictDialog source={conflictTarget} {workspace} close={() => { conflictTarget = undefined }} />{/if}
{#if emojiTarget}<EmojiPicker onPick={chooseEmoji} dismiss={() => { emojiTarget = undefined }} />{/if}
{#if noteDialog}<NoteDialog {workspace} request={noteDialog} close={() => { noteDialog = undefined }} />{/if}
{#if !native}
  <dialog class="capture-dialog" aria-label="Quick Capture" bind:this={captureDialog} onclose={() => { if (!captureDialog?.open) inlineCapture = false }}>
    {#if inlineCapture}<CaptureEditor dismiss={dismissInlineCapture} onSaved={() => void workspace.captured()} />{/if}
  </dialog>
{/if}
