<script lang="ts">
  import { ArrowUpRight, FileText, FolderOpen, LayoutTemplate, Plus } from '@lucide/svelte'
  import { noteFolder, noteName } from '../lib/notes.ts'
  import type { Workspace } from '../lib/workspace.svelte.ts'

  let { workspace, templates }: { workspace: Workspace; templates: () => void } = $props()
</script>

<div class="home-scroll">
  <section class="home-content" aria-labelledby="home-title">
    <h1 id="home-title">Welcome to rightmark</h1>
    <div class="home-actions">
      <button class="button primary comfortable" type="button" disabled={workspace.busy} onclick={() => void workspace.chooseFolder()}><FolderOpen size={16} strokeWidth={1.65} />Open folder</button>
      <button class="button secondary comfortable" type="button" disabled={workspace.busy} onclick={() => void workspace.create()}><Plus size={16} strokeWidth={1.65} />New note</button>
      <button class="button quiet comfortable" type="button" disabled={workspace.busy} onclick={templates}><LayoutTemplate size={16} strokeWidth={1.65} />From template</button>
    </div>
    <div class="recent-section">
      <div class="recent-heading"><h2>Recent notes</h2></div>
      {#if workspace.recent.length}
        <div class="recent-grid">
          {#each workspace.recent.slice(0, 6) as path (path)}
            <button type="button" class="recent-note" data-tooltip={path} onclick={() => void workspace.open(path)}>
              <FileText size={17} strokeWidth={1.55} /><span><strong>{noteName(path)}</strong>{#if noteFolder(path)}<small>{noteFolder(path)}</small>{/if}</span><ArrowUpRight class="recent-arrow" size={13} strokeWidth={1.55} />
            </button>
          {/each}
        </div>
      {:else if !workspace.busy}<p class="home-empty">No notes yet. Create one to get started.</p>{/if}
    </div>
  </section>
</div>
