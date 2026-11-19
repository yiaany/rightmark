<script lang="ts">
  import { onMount } from 'svelte'
  import { CornerDownRight, X } from '@lucide/svelte'
  import { noteHeadings } from '../lib/markdown.ts'
  import { noteName } from '../lib/notes.ts'
  import type { DocumentSession } from '../lib/workspace.svelte.ts'

  let { session, close, jump }: { session: DocumentSession; close: () => void; jump: (ordinal: number, line: number) => void } = $props()
  let dialog: HTMLDialogElement
  let field: HTMLInputElement
  let filter = $state('')
  const headings = $derived(noteHeadings(session.text).filter(({ title }) => title.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())))
  onMount(() => { const element = dialog; element.showModal(); field.focus(); return () => element.close() })
</script>

<dialog class="note-dialog outline-dialog" aria-labelledby="outline-title" bind:this={dialog} oncancel={(event) => { event.preventDefault(); close() }} onclick={(event) => { if (event.target === dialog) close() }}>
  <header class="note-dialog-heading"><div><h2 id="outline-title">Outline</h2><p>{noteName(session.path)}</p></div><button class="icon-button" type="button" aria-label="Close outline" onclick={close}><X size={16} strokeWidth={1.65} /></button></header>
  <input class="work-input" type="search" aria-label="Filter headings" placeholder="Find a heading…" bind:this={field} bind:value={filter} onkeydown={(event) => { if (!event.isComposing && event.key === 'Enter' && headings[0]) { event.preventDefault(); jump(headings[0].ordinal, headings[0].line) } }} />
  <ul aria-label="Headings">
    {#each headings as heading (heading.from)}
      <li><button type="button" style:--outline-depth={Math.min(heading.depth - 1, 4)} data-level={heading.depth} onclick={() => jump(heading.ordinal, heading.line)}><span>{heading.title}</span><CornerDownRight size={14} strokeWidth={1.55} aria-hidden="true" /></button></li>
    {:else}<li class="outline-empty">{filter ? 'No matching headings.' : 'No headings in this note.'}</li>{/each}
  </ul>
</dialog>
