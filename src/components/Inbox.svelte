<script lang="ts">
  import { tick } from 'svelte'
  import { Archive, FilePlus2, Folder, Inbox, Link2, ListChecks, SquarePen, Undo2 } from '@lucide/svelte'
  import Dropdown from './Dropdown.svelte'
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
  let chooser = $state<HTMLFormElement>()
  let revision = $state(0)
  let files = $derived(workspace.notes.filter(({ path }) => !path.startsWith('Inbox/')))
  let folders = $derived([...new Set(files.map(({ path }) => noteFolder(path)).flatMap((folder) => folder.split('/').map((_, index, parts) => parts.slice(0, index + 1).join('/'))))].filter(Boolean).sort())
  const labels = { move: 'Saved as a note.', append: 'Added to the note.', task: 'Added to Tasks.', archive: 'Archived.' }
  const dates = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

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
    if (options) { await tick(); chooser?.querySelector<HTMLButtonElement>('.dropdown-trigger')?.focus() }
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
    <header class="work-heading inbox-heading">
      <h1 id="inbox-title">Inbox</h1>
      <button type="button" class="button capture-action" data-tooltip="Quick Capture" data-tooltip-key={shortcut} onclick={capture}><SquarePen size={16} strokeWidth={1.65} aria-hidden="true" /> New capture</button>
    </header>
    {#if notice || workspace.canUndoInbox}
      <div class="inbox-notice"><span role="status">{notice || 'Last Inbox action'}</span>{#if workspace.canUndoInbox}<button type="button" disabled={pending} onclick={() => void undo()}><Undo2 size={14} /> Undo</button>{/if}</div>
    {/if}
    {#if error || workspace.inboxProblem}<p class="inbox-error" role="alert">{error || workspace.inboxProblem}</p>{/if}
    {#if selected}
      <div class="inbox-review">
        <div class="inbox-queue">
          <h2 id="inbox-queue-title">To review <span>{workspace.inbox.length}</span></h2>
          <nav class="inbox-list" aria-labelledby="inbox-queue-title">
            {#each workspace.inbox as note (inboxId(note))}
              <button type="button" aria-current={inboxId(selected) === inboxId(note) ? 'true' : undefined} disabled={pending} onclick={() => select(note)}>
                <strong>{noteName(note.path)}</strong>{#if note.modifiedAt}<small>{dates.format(note.modifiedAt)}</small>{/if}
              </button>
            {/each}
          </nav>
        </div>
        <article class="inbox-detail" aria-label={noteName(selected.path)}>
          <div class="inbox-preview">
          <h2>{useFirstLine ? firstLine : noteName(selected.path)}</h2>
          {#if preview?.id === inboxId(selected)}
            {@const body = useFirstLine ? previewCopy.slice(firstLine.length).trimStart() : previewCopy}
            {#if body || !previewCopy}<p class="inbox-text">{body || 'This note is empty.'}</p>{/if}
          {:else if !error}<p class="inbox-text">Reading note…</p>{/if}
          </div>
          <div class="inbox-actions" role="group" aria-label="Process note">
            <button type="button" class="button secondary" disabled={!preview || pending} aria-expanded={options === 'move'} onclick={() => void choose('move')}><FilePlus2 size={15} strokeWidth={1.65} /> Keep as note</button>
            <Dropdown label="More Inbox actions" placeholder="More" quiet disabled={!preview || pending} options={[
              { value: 'append', label: 'Add to note', icon: Link2, disabled: !files.length },
              { value: 'task', label: 'Make task', icon: ListChecks, disabled: !preview?.text.trim() },
              { value: 'archive', label: 'Archive', icon: Archive },
            ]} onChange={(value) => { if (value === 'append') void choose('append'); else if (value === 'task' || value === 'archive') void apply({ kind: value }) }} />
          </div>
          {#if options}
            <form class="inbox-destination" bind:this={chooser} onsubmit={(event) => {
              event.preventDefault()
              if (options === 'move') void apply({ kind: 'move', folder: destination })
              else if (destination) void apply({ kind: 'append', target: destination })
            }}>
              <div>
                <Dropdown label={options === 'move' ? 'Destination folder' : 'Destination note'} value={destination} placeholder="Choose a note…" icon={options === 'move' ? Folder : Link2} stretch searchable={options === 'append' || folders.length > 8} disabled={pending}
                  options={options === 'move' ? [{ value: '', label: 'Workspace root' }, ...folders.map((item) => ({ value: item, label: item }))] : files.map(({ path }) => ({ value: path, label: noteName(path), detail: noteFolder(path) || 'Workspace' }))}
                  onChange={(value) => { destination = value }} />
                <button type="submit" class="button primary" disabled={pending || (options === 'append' && !destination)}>{options === 'move' ? 'Move' : 'Add'}</button>
              </div>
            </form>
          {/if}
        </article>
      </div>
    {:else if !workspace.busy && !workspace.inboxProblem}
      <div class="work-empty"><Inbox size={26} strokeWidth={1.45} /><h2>You’re all caught up</h2><p>Save a thought with Quick Capture and sort it here later.</p></div>
    {/if}
  </div>
</section>
