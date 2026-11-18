<script lang="ts">
  import { FileText, FolderOpen, Plus } from '@lucide/svelte'
  import { noteFolder, noteName } from '../lib/notes.ts'
  import type { Workspace } from '../lib/workspace.svelte.ts'

  let { workspace }: { workspace: Workspace } = $props()
</script>

<div class="home-scroll">
  <section class="home-content" aria-labelledby="home-title">
    <h1 id="home-title">Open a Markdown workspace</h1>
    <div class="home-actions">
      <button class="button primary" type="button" disabled={workspace.busy} onclick={() => void workspace.chooseFolder()}><FolderOpen size={16} />Open folder</button>
      <button class="button secondary" type="button" disabled={workspace.busy} onclick={() => void workspace.create()}><Plus size={17} />New note</button>
    </div>
    <div class="recent-section">
      <div class="recent-heading"><h2>Recent notes</h2></div>
      {#if workspace.recent.length}
        <div class="recent-grid">
          {#each workspace.recent.slice(0, 6) as path (path)}
            <button type="button" class="recent-note" title={path} onclick={() => void workspace.open(path)}>
              <FileText size={19} strokeWidth={1.5} /><span><strong>{noteName(path)}</strong>{#if noteFolder(path)}<small>{noteFolder(path)}</small>{/if}</span>
            </button>
          {/each}
        </div>
      {:else if !workspace.busy}<p class="home-empty">No notes yet. Create one to get started.</p>{/if}
    </div>
  </section>
</div>
