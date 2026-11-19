<script lang="ts">
  import { onMount } from 'svelte'
  import { LayoutTemplate, X } from '@lucide/svelte'
  import Dropdown from './Dropdown.svelte'
  import { noteFolder, noteName } from '../lib/notes.ts'
  import { defaultTemplates, markdownDiff } from '../lib/note-actions.ts'
  import type { Version } from '../lib/storage.ts'
  import type { Workspace } from '../lib/workspace.svelte.ts'

  let { workspace, request, close }: {
    workspace: Workspace; request: { kind: 'move' | 'history' | 'template'; path?: string }; close: () => void
  } = $props()
  const path = $derived(request.path ?? '')
  const heading = $derived(request.kind === 'move' ? 'Rename or move note' : request.kind === 'history' ? 'Version history' : 'New from template')
  let dialog: HTMLDialogElement
  let name = $state(''), folder = $state(''), template = $state('')
  let error = $state(''), busy = $state(false)
  const folders = $derived([...new Set(workspace.notes.map(({ path }) => noteFolder(path)).filter(Boolean))].sort())
  const missingStarters = $derived(defaultTemplates.some(({ title }) => !workspace.templates.some(({ path }) => path === `Templates/${title}.md`)))

  let versions = $state<Version[]>([]), selected = $state('')
  let previous = $state<string>(), current = $state(''), confirm = $state(false), full = $state(false)
  let reading = $state(false), readId = 0
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
  const diff = $derived(previous === undefined || full ? [] : markdownDiff(previous, current).filter((line) => line.kind !== 'same'))

  onMount(() => {
    if (request.kind === 'move') { name = noteName(path); folder = noteFolder(path) }
    dialog.showModal()
    const element = dialog
    if (request.kind !== 'history') element.querySelector<HTMLElement>('.dropdown-trigger, .work-input')?.focus()
    if (request.kind === 'history') void loadHistory()
    return () => { readId++; element.close() }
  })

  const problem = (value: unknown) => value instanceof Error ? value.message : String(value)

  async function loadHistory() {
    busy = true
    try {
      const session = workspace.sessions.get(path)
      if (!session || !(await workspace.save(session))) throw new Error(session?.error || 'The note could not be saved.')
      current = session.text
      versions = await workspace.versions(path)
      if (versions[0]) await selectVersion(versions[0].id)
    } catch (value) { error = problem(value) }
    finally { busy = false }
  }

  async function selectVersion(id: string) {
    selected = id; previous = undefined; confirm = false; error = ''; reading = true
    const stamp = ++readId
    try { const text = await workspace.version(path, id); if (stamp === readId) previous = text }
    catch (value) { if (stamp === readId) error = problem(value) }
    finally { if (stamp === readId) reading = false }
  }

  async function install() {
    error = ''; busy = true
    try { await workspace.installTemplates(); template = workspace.templates[0]?.path ?? '' }
    catch (value) { error = problem(value) }
    finally { busy = false }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (busy) return
    if (request.kind === 'history') {
      if (reading || previous === undefined || previous === current) return
      if (!confirm) { confirm = true; return }
    }
    error = ''; busy = true
    try {
      if (request.kind === 'move') await workspace.move(path, name, folder)
      else if (request.kind === 'template') await workspace.createFromTemplate(template, name, folder)
      else if (previous !== undefined && previous !== current) await workspace.restoreVersion(path, selected, current)
      close()
    } catch (value) { error = problem(value); confirm = false }
    finally { busy = false }
  }
</script>

<dialog class="note-dialog" class:history-dialog={request.kind === 'history'} bind:this={dialog} aria-labelledby="note-dialog-title"
  oncancel={(event) => { event.preventDefault(); if (!busy) { if (confirm) confirm = false; else close() } }} onclick={(event) => { if (!busy && event.target === dialog) close() }}>
  <form onsubmit={submit}>
    <header class="note-dialog-heading"><div><h2 id="note-dialog-title">{heading}</h2>
      {#if request.kind !== 'history'}<p>{request.kind === 'move' ? 'rightmark updates links across this workspace.' : 'Make a new note from a Markdown file in Templates.'}</p>{/if}</div>
      <button type="button" class="icon-button" aria-label="Close dialog" disabled={busy} onclick={close}><X size={17} /></button>
    </header>

    {#if request.kind === 'history'}
      {#if versions.length}
        <Dropdown label="Saved version" value={selected} quiet disabled={busy} options={versions.map((item, index) => ({ value: item.id, label: date.format(item.savedAt), detail: index === 0 ? 'Latest' : undefined }))} onChange={(id) => void selectVersion(id)} />
        {#key selected}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard users need to scroll the version) -->
          <div class="version-content" tabindex="0" role="region" aria-busy={reading} aria-label={full ? 'Saved Markdown' : 'Changes from saved version to current note'}>
            {#if reading}<p role="status">Reading version…</p>
            {:else if previous !== undefined && full}<pre>{previous || '(Empty note)'}</pre>
            {:else if diff.length}
              {#each diff.slice(0, 600) as row, index (index)}<div class="diff-line" class:removed={row.kind === 'removed'}><span aria-label={row.kind}>{row.kind === 'added' ? '+' : '−'}</span><code>{row.text || ' '}</code></div>{/each}
              {#if diff.length > 600}<p>Showing the first 600 changed lines. View saved text to read the full version.</p>{/if}
            {:else if previous !== undefined}<p>No changes from this version.</p>{/if}
          </div>
        {/key}
      {:else}
        <p class="history-empty" role="status">{busy ? 'Loading versions…' : error ? 'Could not load saved versions.' : 'No saved versions yet.'}</p>
      {/if}
    {:else}
      {#if request.kind === 'template'}
        {#if workspace.templates.length}
          <div class="note-field"><span>Template</span><Dropdown label="Template" value={template} placeholder="Choose a template…" disabled={busy} stretch searchable={workspace.templates.length > 8} options={workspace.templates.map(({ path }) => ({ value: path, label: noteName(path), detail: noteFolder(path) === 'Templates' ? undefined : noteFolder(path) }))} onChange={(value) => { template = value }} /></div>
          {#if missingStarters}<button type="button" class="button quiet template-starters" onclick={() => void install()} disabled={busy}>Install starter templates</button>{/if}
        {:else}
          <div class="note-dialog-empty"><LayoutTemplate size={20} strokeWidth={1.55} /><p>Add any Markdown file to <strong>Templates/</strong>, or install Meeting, Research, and Weekly review.</p><button type="button" class="button secondary" onclick={() => void install()} disabled={busy}>Install starter templates</button></div>
        {/if}
      {/if}
      {#if request.kind === 'move' || workspace.templates.length}
        <label>Note name <input class="work-input" required bind:value={name} disabled={busy} placeholder="Untitled" autocomplete="off" /></label>
        <div class="note-field"><label for="note-folder">Folder</label><div class="folder-field">
          <input id="note-folder" class="work-input" bind:value={folder} disabled={busy} placeholder="Workspace root" autocomplete="off" />
          {#if folders.length}<Dropdown label="Existing folders" placeholder="Browse" searchable disabled={busy} options={[{ value: '', label: 'Workspace root' }, ...folders.map((value) => ({ value, label: value }))]} onChange={(value) => { folder = value }} />{/if}
        </div></div>
        <p class="dialog-note">{request.kind === 'move' ? 'Leave Folder blank to use the workspace root.' : 'Templates are ordinary notes you can edit in the file tree.'}</p>
      {/if}
    {/if}
    {#if error}<p class="inbox-error" role="alert">{error}</p>{/if}
    {#if confirm}<p class="dialog-note" role="status">The current note will be kept in history before restoring.</p>{/if}
    {#if request.kind === 'history'}
      {#if versions.length}<footer class="history-actions">
        {#if confirm}<button type="button" class="button quiet" disabled={busy} onclick={() => { confirm = false }}>Cancel</button>
        {:else}<button type="button" class="button quiet history-text-toggle" disabled={busy || reading || previous === undefined} onclick={() => { full = !full }}>{full ? 'Show changes' : 'View saved text'}</button>{/if}
        <button type="submit" class="button" class:primary={confirm} class:secondary={!confirm} disabled={busy || reading || previous === undefined || previous === current}>{busy && confirm ? 'Restoring…' : confirm ? 'Confirm restore' : 'Restore version'}</button>
      </footer>{/if}
    {:else}
      <footer>
        <button type="button" class="button quiet" disabled={busy} onclick={close}>Cancel</button>
        {#if request.kind === 'move'}<button type="submit" class="button primary" disabled={busy || !name.trim()}>{busy ? 'Updating links…' : 'Save changes'}</button>
        {:else if workspace.templates.length}<button type="submit" class="button primary" disabled={busy || !template || !name.trim()}>{busy ? 'Creating…' : 'Create note'}</button>{/if}
      </footer>
    {/if}
  </form>
</dialog>
