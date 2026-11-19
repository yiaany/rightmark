<script lang="ts">
  import { FileText, RotateCcw, Trash2 } from '@lucide/svelte'
  import { noteFolder, noteName } from '../lib/notes.ts'
  import type { Workspace } from '../lib/workspace.svelte.ts'

  let { workspace }: { workspace: Workspace } = $props()
  let confirm = $state('')
  const dates = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

  async function remove(id: string) {
    if (confirm !== id) { confirm = id; return }
    await workspace.processTrash(id, 'delete')
    confirm = ''
  }
</script>

<section class="tasks-scroll" aria-labelledby="trash-title">
  <div class="tasks-content">
    <header class="work-heading"><div><h1 id="trash-title">Trash</h1><p>Restore notes to their original folder.</p></div></header>
    {#if workspace.trashError}<p class="inbox-error" role="alert">{workspace.trashError}</p>{/if}
    {#each workspace.trashItems as item (item.id)}
      <article class="trash-row" aria-label={noteName(item.path)}>
        <FileText size={17} strokeWidth={1.6} aria-hidden="true" />
        <div class="trash-name"><strong>{noteName(item.path)}</strong><small>{noteFolder(item.path) || 'Workspace'}{#if item.deletedAt} · {dates.format(item.deletedAt)}{/if}</small></div>
        <div class="trash-actions">
          {#if confirm === item.id}
            <span class="trash-warning" role="status">This can’t be undone.</span>
            <button type="button" class="button quiet" disabled={workspace.trashBusy} onclick={() => { confirm = '' }}>Cancel</button>
            <button type="button" class="button trash-delete" disabled={workspace.trashBusy} onclick={() => void remove(item.id)}>Delete permanently</button>
          {:else}
            <button type="button" class="button secondary" disabled={workspace.trashBusy} onclick={() => void workspace.processTrash(item.id, 'restore')}><RotateCcw size={14} /> Restore</button>
            <button type="button" class="icon-button" aria-label={`Permanently delete ${noteName(item.path)}`} data-tooltip="Delete permanently" disabled={workspace.trashBusy} onclick={() => void remove(item.id)}><Trash2 size={16} strokeWidth={1.65} /></button>
          {/if}
        </div>
      </article>
    {:else}
      {#if !workspace.trashError}<div class="work-empty"><Trash2 size={26} strokeWidth={1.45} /><h2>{workspace.trashLoading ? 'Loading Trash…' : 'Trash is empty'}</h2>{#if !workspace.trashLoading}<p>Deleted notes appear here until you restore or permanently delete them.</p>{/if}</div>{/if}
    {/each}
  </div>
</section>
