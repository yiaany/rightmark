<script lang="ts">
  import { tick } from 'svelte'
  import { Archive, ChevronRight, FileText, Inbox, ListChecks, Plus, Undo2 } from '@lucide/svelte'
  import { inboxId, type InboxAction, type InboxNote } from '../lib/inbox.ts'
  import { noteFolder, noteName } from '../lib/notes.ts'
  import type { Workspace } from '../lib/workspace.svelte.ts'

  let { workspace, capture, shortcut }: { workspace: Workspace; capture: () => void; shortcut: string } = $props()
  let chosen = $state('')
  let selected = $derived(workspace.inbox.find((note) => inboxId(note) === chosen) ?? workspace.inbox[0])
  let preview = $state<{ id: string; text: string }>()
  let previewCopy = $derived(preview?.text.trim() ?? '')
  let firstLine = $derived(previewCopy.split(/\r?\n/, 1)[0] ?? '')
  let useFirstLine = $derived(firstLine !== '' && firstLine.length <= 110)
  let pending = $state(false)
  let error = $state('')
  let notice = $state('')
  let options = $state<'move' | 'append'>()
  let destination = $state('')
  let chooser = $state<HTMLSelectElement>()
  let revision = $state(0)
  let files = $derived(workspace.notes.filter(({ path }) => !path.startsWith('Inbox/')))
  let folders = $derived([...new Set(files.map(({ path }) => noteFolder(path)).flatMap((folder) => folder.split('/').map((_, index, parts) => parts.slice(0, index + 1).join('/'))))].filter(Boolean).sort())
  const labels = { move: 'Saved as a note.', append: 'Added to the note.', task: 'Added to Tasks.', archive: 'Archived.' }

  $effect(() => {
    revision
    const note = selected
    preview = undefined
    if (!note) return
    let cancelled = false
    void workspace.readInbox(note).then((text) => { if (!cancelled) preview = { id: inboxId(note), text } })
      .catch((cause) => { if (!cancelled) error = String(cause) })
    return () => { cancelled = true }
  })

  function select(note: InboxNote) {
    if (pending) return
    chosen = inboxId(note); options = undefined; error = ''; revision++
  }

  async function choose(kind: 'move' | 'append') {
    options = options === kind ? undefined : kind
    destination = ''
    if (options) { await tick(); chooser?.focus() }
  }

  async function apply(action: InboxAction) {
    if (!selected || !preview || preview.id !== inboxId(selected) || pending) return
    const index = workspace.inbox.indexOf(selected)
    pending = true; error = ''
    try {
      await workspace.processInbox(selected, preview.text, action)
      const next = workspace.inbox[Math.min(index, workspace.inbox.length - 1)]
      chosen = next ? inboxId(next) : ''
      notice = labels[action.kind]; options = undefined
    } catch (cause) { error = String(cause); revision++ }
    finally { pending = false }
  }

  async function undo() {
    if (pending) return
    pending = true; error = ''
    try { await workspace.undoInbox(); notice = 'Restored to Inbox.' }
    catch (cause) { error = String(cause) }
    finally { pending = false }
  }
</script>

<section class="inbox-scroll" aria-labelledby="inbox-title">
  <div class="inbox-content">
    <header class="inbox-heading">
      <div><h1 id="inbox-title">Inbox</h1><p>{workspace.inbox.length ? `${workspace.inbox.length} ${workspace.inbox.length === 1 ? 'note' : 'notes'} to review` : 'A place for things you want to come back to.'}</p></div>
      <button type="button" class="button secondary" onclick={capture}><Plus size={15} /> Quick Capture <kbd>{shortcut}</kbd></button>
    </header>
    {#if notice || workspace.canUndoInbox}
      <div class="inbox-notice"><span role="status">{notice || 'Last Inbox action'}</span>{#if workspace.canUndoInbox}<button type="button" disabled={pending} onclick={() => void undo()}><Undo2 size={14} /> Undo</button>{/if}</div>
    {/if}
    {#if error || workspace.inboxProblem}<p class="inbox-error" role="alert">{error || workspace.inboxProblem}</p>{/if}
    {#if selected}
      <div class="inbox-review">
        <nav class="inbox-list" aria-label="Captured notes">
          {#each workspace.inbox as note (inboxId(note))}
            <button type="button" aria-current={inboxId(selected) === inboxId(note) ? 'true' : undefined} disabled={pending} onclick={() => select(note)}>
              <FileText size={16} strokeWidth={1.6} /><span><strong>{noteName(note.path)}</strong>{#if note.local}<small>Local Inbox</small>{/if}</span><ChevronRight size={13} />
            </button>
          {/each}
        </nav>
        <article class="inbox-detail" aria-label={noteName(selected.path)}>
          <h2>{useFirstLine ? firstLine : noteName(selected.path)}</h2>
          {#if preview?.id === inboxId(selected)}
            {@const body = useFirstLine ? previewCopy.slice(firstLine.length).trimStart() : previewCopy}
            {#if body || !previewCopy}<p class="inbox-text">{body || 'This note is empty.'}</p>{/if}
          {:else if !error}<p class="inbox-text">Reading note…</p>{/if}
          <div class="inbox-actions" role="group" aria-label="Process note">
            <button type="button" class="button secondary" disabled={!preview || pending} aria-expanded={options === 'move'} onclick={() => void choose('move')}>Keep as note</button>
            <button type="button" class="button secondary" disabled={!preview || pending || !files.length} aria-expanded={options === 'append'} onclick={() => void choose('append')}>Add to note</button>
            <button type="button" class="button secondary" disabled={!preview?.text.trim() || pending} onclick={() => void apply({ kind: 'task' })}><ListChecks size={15} /> Make task</button>
            <button type="button" class="icon-button" aria-label="Archive note" data-tooltip="Archive note" disabled={!preview || pending} onclick={() => void apply({ kind: 'archive' })}><Archive size={16} /></button>
          </div>
          {#if options}
            <form class="inbox-destination" onsubmit={(event) => {
              event.preventDefault()
              if (options === 'move') void apply({ kind: 'move', folder: destination })
              else if (destination) void apply({ kind: 'append', target: destination })
            }}>
              <label for="inbox-destination">{options === 'move' ? 'Destination folder' : 'Destination note'}</label>
              <div><select id="inbox-destination" bind:this={chooser} bind:value={destination} disabled={pending}>
                {#if options === 'move'}<option value="">Workspace root</option>{#each folders as folder (folder)}<option value={folder}>{folder}</option>{/each}
                {:else}<option value="" disabled>Choose a note…</option>{#each files as note (note.path)}<option value={note.path}>{noteName(note.path)}{noteFolder(note.path) ? ` — ${noteFolder(note.path)}` : ''}</option>{/each}{/if}
              </select><button type="submit" class="button primary" disabled={pending || (options === 'append' && !destination)}>{options === 'move' ? 'Move' : 'Add'}</button></div>
            </form>
          {/if}
        </article>
      </div>
    {:else if !workspace.busy && !workspace.inboxProblem}
      <div class="inbox-empty"><Inbox size={25} strokeWidth={1.45} /><h2>You’re all caught up</h2><p>Notes saved with Quick Capture will appear here.</p></div>
    {/if}
  </div>
</section>
