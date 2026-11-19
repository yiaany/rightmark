<script lang="ts">
  import { onMount } from 'svelte'
  import { X } from '@lucide/svelte'
  import { markdownDiff } from '../lib/note-actions.ts'
  import { noteName } from '../lib/notes.ts'
  import type { Draft } from '../lib/storage.ts'
  import type { DocumentSession, Workspace } from '../lib/workspace.svelte.ts'

  let { source, workspace, close }: { source: DocumentSession | Draft; workspace: Workspace; close: () => void } = $props()
  const session = $derived('conflict' in source ? source as DocumentSession : undefined)
  const disk = $derived(session?.conflict?.disk ?? null)
  const changed = $derived(disk === null ? [] : markdownDiff(disk, source.text).filter(({ kind }) => kind !== 'same'))
  let dialog: HTMLDialogElement
  let busy = $state(false), confirm = $state(false), error = $state('')
  onMount(() => { const element = dialog; element.showModal(); return () => element.close() })

  async function resolve(useDisk = false) {
    if (busy) return
    if (useDisk && !confirm) { confirm = true; return }
    busy = true; error = ''
    try {
      if (useDisk) { if (session && disk !== null) await workspace.useDisk(session, disk); else return }
      else await workspace.keepCopy(source)
      close()
    } catch (err) { error = err instanceof Error ? err.message : String(err); confirm = false }
    finally { busy = false }
  }
</script>

<dialog class="note-dialog history-dialog" aria-labelledby="conflict-title" bind:this={dialog} oncancel={(event) => { event.preventDefault(); if (!busy) close() }}>
  <div class="conflict-content">
    <header class="note-dialog-heading"><div><h2 id="conflict-title">{disk === null ? 'Recover your edits' : 'File changed on disk'}</h2><p>{noteName(source.path)}</p></div><button class="icon-button" type="button" aria-label="Close comparison" disabled={busy} onclick={close}><X size={16} strokeWidth={1.65} /></button></header>
    <p class="dialog-note">{disk === null ? 'The original file isn’t readable. Save your text as a new note.' : 'Automatic saving is paused. Save your edits as a new note, or use the version on disk.'}</p>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (the diff is independently scrollable) -->
    <div class="version-content" role="region" aria-label={disk === null ? 'Recovered Markdown' : 'Differences between disk and your edits'} tabindex="0">
      {#if disk === null}<pre>{source.text || '(Empty note)'}</pre>
      {:else if changed.length}
        {#each changed.slice(0, 600) as row, index (index)}<div class="diff-line" class:removed={row.kind === 'removed'}><span aria-label={row.kind === 'removed' ? 'On disk' : 'Your edits'}>{row.kind === 'removed' ? '−' : '+'}</span><code>{row.text || ' '}</code></div>{/each}
        {#if changed.length > 600}<p>Showing the first 600 changed lines.</p>{/if}
      {:else}<p>Both versions now have the same text.</p>{/if}
    </div>
    {#if disk !== null && changed.length}<p class="dialog-note">− On disk &nbsp; + Your edits</p>{/if}
    {#if confirm}<p class="dialog-note" role="status">Use the disk version and discard the unsaved edits?</p>{/if}
    {#if error}<p class="inbox-error" role="alert">{error}</p>{/if}
    <footer>
      {#if confirm}<button class="button quiet" type="button" disabled={busy} onclick={() => { confirm = false }}>Cancel</button><button type="button" class="button secondary" disabled={busy} onclick={() => void resolve(true)}>Discard my edits</button>
      {:else}{#if disk !== null}<button type="button" class="button quiet" disabled={busy} onclick={() => void resolve(true)}>Use disk version</button>{/if}<button type="button" class="button primary" disabled={busy} onclick={() => void resolve()}>{busy ? 'Saving…' : 'Save a copy'}</button>{/if}
    </footer>
  </div>
</dialog>
