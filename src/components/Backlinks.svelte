<script lang="ts">
  import { tick } from 'svelte'
  import { ArrowUpRight, ChevronUp, FileText, Link2 } from '@lucide/svelte'
  import { noteFolder, noteName } from '../lib/notes.ts'
  import type { Workspace } from '../lib/workspace.svelte.ts'

  let { workspace, path }: { workspace: Workspace; path: string } = $props()
  let links = $derived(workspace.backlinks(path))
  const groups = $derived.by(() => {
    const entries = new Map<string, typeof links>()
    for (const link of links) {
      const group = entries.get(link.path)
      if (group) group.push(link)
      else entries.set(link.path, [link])
    }
    return [...entries]
  })
  let visible = $state(false)
  let root: HTMLElement, trigger: HTMLButtonElement
  let panel = $state<HTMLElement>()

  async function toggle(event: MouseEvent) {
    visible = !visible
    if (visible && event.detail === 0) { await tick(); (panel?.querySelector<HTMLButtonElement>('button') ?? panel)?.focus() }
  }
</script>

<svelte:window onpointerdown={(event) => { if (visible && !event.composedPath().includes(root)) visible = false }} onkeydown={(event) => {
  if (visible && event.key === 'Escape' && !event.defaultPrevented && !window.document.querySelector('dialog[open]')) {
    event.preventDefault(); visible = false
    if (root?.contains(window.document.activeElement)) trigger?.focus()
  }
}} />

<footer class="document-references" bind:this={root}>
  <button class="backlinks-trigger" type="button" bind:this={trigger} aria-expanded={visible} aria-controls={visible ? 'note-backlinks' : undefined} onclick={toggle}>
    <Link2 size={14} strokeWidth={1.6} /> Backlinks <span>{links.length}</span><ChevronUp size={11} strokeWidth={1.65} aria-hidden="true" />
  </button>
  {#if visible}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (the empty panel is the keyboard focus fallback) -->
    <section class="backlinks" id="note-backlinks" aria-label="Backlinks" tabindex="-1" bind:this={panel}>
      <header><strong>Backlinks</strong>{#if links.length}<span>{links.length} {links.length === 1 ? 'mention' : 'mentions'}</span>{/if}</header>
      <div class="backlinks-list">
        {#each groups as [source, mentions] (source)}
          <section class="backlink-group" aria-label={source}>
            <div class="backlink-source"><FileText size={15} strokeWidth={1.6} /><div><h3>{noteName(source)}</h3>{#if noteFolder(source)}<small>{noteFolder(source)}</small>{/if}</div></div>
            {#each mentions as link (link.match.from)}
              <button class="backlink-row" type="button" onclick={() => { visible = false; void workspace.open(link.path, true, link.match) }}>
                <span class="backlink-context">{link.excerpt.before}<mark>{link.label || link.match.text}</mark>{link.excerpt.after}</span>
                <ArrowUpRight size={14} strokeWidth={1.6} aria-hidden="true" />
              </button>
            {/each}
          </section>
        {:else}
          <p>{workspace.indexing ? 'Finding mentions…' : 'Links from other notes will appear here.'}</p>
        {/each}
      </div>
    </section>
  {/if}
</footer>
