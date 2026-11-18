<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { Focus, Minus, Plus, SlidersHorizontal } from '@lucide/svelte'
  import { buildGraph, filterGraph } from '../lib/graph.ts'
  import { mountGraph } from '../lib/graph-canvas.ts'
  import { noteFolder, noteName } from '../lib/notes.ts'
  import type { Workspace } from '../lib/workspace.svelte.ts'

  let { workspace }: { workspace: Workspace } = $props()
  let canvas: HTMLCanvasElement
  let controls = $state<ReturnType<typeof mountGraph>>()
  let local = $state(false)
  let depth = $state(1)
  let orphans = $state(true)
  let hovered = $state('')
  const cache = new Map<string, { text: string; links: string[] }>()
  const graph = $derived.by(() => {
    workspace.indexVersion
    return buildGraph(workspace.notes, workspace.index, cache)
  })
  const root = $derived(local ? workspace.active?.path ?? '' : '')
  const visible = $derived(filterGraph(graph, root, depth, orphans))
  let fittedRoot = ''

  onMount(() => {
    const view = mountGraph(canvas, (path) => void workspace.open(path), (path) => { hovered = path })
    controls = view
    return view.destroy
  })
  $effect(() => {
    controls?.update(visible, root)
    if (root !== fittedRoot) { fittedRoot = root; controls?.fit() }
  })

  function fit() { untrack(() => controls?.fit(false)) }
</script>

<section class="graph-view" aria-label="Link graph">
  <canvas bind:this={canvas} tabindex="0" aria-label="Link graph canvas. Arrow keys pan; plus and minus zoom; zero fits all notes."></canvas>
  <header class="graph-heading">
    <h1>Graph</h1>
    <span>{workspace.indexing ? 'Reading notes…' : `${visible.nodes.length} ${visible.nodes.length === 1 ? 'note' : 'notes'} · ${visible.links.length} ${visible.links.length === 1 ? 'link' : 'links'}`}</span>
  </header>

  <div class="graph-tools">
    <div class="graph-scope" role="group" aria-label="Graph scope">
      <button type="button" aria-pressed={!local} onclick={() => { local = false }}>All notes</button>
      <button type="button" disabled={!workspace.active} aria-pressed={local} title={workspace.active ? 'Show notes related to the last open note' : 'Open a note to use the local graph'} onclick={() => { local = true }}>Local</button>
    </div>
    <details class="graph-settings">
      <summary title="Graph settings" aria-label="Graph settings"><SlidersHorizontal size={15} strokeWidth={1.55} /></summary>
      <div>
        {#if local}
          <label>Depth <select bind:value={depth}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
        {:else}
          <label><input type="checkbox" bind:checked={orphans} /> Show unlinked notes</label>
        {/if}
        {#if visible.nodes.length}
          <label class="graph-jump">Open note <select value="" onchange={(event) => { if (event.currentTarget.value) void workspace.open(event.currentTarget.value) }}>
            <option value="" disabled>Choose a note…</option>
            {#each visible.nodes as node (node.id)}<option value={node.id}>{node.title}{noteFolder(node.id) ? ` — ${noteFolder(node.id)}` : ''}</option>{/each}
          </select></label>
        {/if}
      </div>
    </details>
  </div>

  {#if !visible.nodes.length}
    <div class="graph-empty"><p>{workspace.indexing ? 'Reading notes…' : workspace.notes.length ? 'No linked notes' : 'No notes yet'}</p>
      {#if !workspace.indexing}<span>{workspace.notes.length ? 'Add an internal link or show unlinked notes.' : 'Create a note to see it here.'}</span>{/if}
    </div>
  {/if}

  {#if hovered || root}
    <div class="graph-caption">{noteName(hovered || root)}{#if noteFolder(hovered || root)}<small>{noteFolder(hovered || root)}</small>{/if}</div>
  {/if}
  <div class="graph-camera" role="group" aria-label="Graph camera">
    <button class="icon-button" aria-label="Zoom out" title="Zoom out" onclick={() => controls?.zoom(1 / 1.25)}><Minus size={15} /></button>
    <button class="icon-button" aria-label="Zoom in" title="Zoom in" onclick={() => controls?.zoom(1.25)}><Plus size={15} /></button>
    <button class="icon-button fit-graph" aria-label="Fit graph" title="Fit graph" onclick={fit}><Focus size={15} strokeWidth={1.55} /></button>
  </div>
</section>

<style>
  .graph-view { position: relative; min-height: 0; flex: 1; overflow: hidden; isolation: isolate; }
  canvas { display: block; position: absolute; inset: 0; width: 100%; height: 100%; cursor: grab; touch-action: none; }
  canvas:focus-visible { outline: 1px solid var(--accent); outline-offset: -2px; }
  .graph-heading { position: absolute; top: 19px; left: 21px; padding: 2px 4px; pointer-events: none; background: var(--canvas); border-radius: 5px; }
  h1 { margin: 0 0 3px; font-size: 17px; line-height: 1.2; font-weight: 625; letter-spacing: -.02em; }
  .graph-heading span, .graph-caption small { color: var(--muted); font-size: 11px; }
  .graph-tools { position: absolute; top: 18px; right: 17px; display: flex; align-items: center; gap: 6px; }
  .graph-scope, .graph-settings summary, .graph-camera { display: flex; align-items: center; gap: 2px; background: var(--canvas); border: 1px solid var(--edge); border-radius: 7px; padding: 2px; }
  .graph-scope button { padding: 4px 8px; font-size: 11px; color: var(--muted); border-radius: 4px; white-space: nowrap; }
  .graph-scope button[aria-pressed='true'] { color: var(--ink); background: var(--selected); }
  .graph-scope button:hover:not(:disabled), .graph-settings summary:hover { color: var(--ink); }
  .graph-settings { position: relative; }
  .graph-settings summary { list-style: none; width: 30px; height: 29px; justify-content: center; color: var(--muted); cursor: pointer; }
  .graph-settings summary::-webkit-details-marker { display: none; }
  .graph-settings > div { position: absolute; top: calc(100% + 7px); right: 0; width: 212px; padding: 9px 10px; border: 1px solid var(--edge); border-radius: 7px; background: var(--surface); box-shadow: var(--shadow); }
  .graph-settings label { display: flex; align-items: center; gap: 8px; color: var(--body); font-size: 12px; }
  .graph-settings .graph-jump { align-items: stretch; flex-direction: column; border-top: 1px solid var(--line); margin-top: 9px; padding-top: 9px; gap: 5px; }
  select { max-width: 100%; font: inherit; color: var(--ink); background: var(--canvas); border: 1px solid var(--edge); border-radius: 4px; padding: 3px; }
  .graph-camera { position: absolute; bottom: 17px; right: 17px; }
  .graph-camera .fit-graph { margin-left: 2px; }
  .graph-caption { position: absolute; bottom: 17px; left: 21px; padding: 5px 8px; color: var(--body); max-width: calc(100% - 140px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; pointer-events: none; background: var(--canvas); border: 1px solid var(--line); border-radius: 6px; }
  .graph-caption small { display: block; }
  .graph-empty { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; pointer-events: none; padding: 24px; }
  .graph-empty p { margin: 0 0 4px; font-weight: 600; }
  .graph-empty span { color: var(--muted); }
  @media (max-width: 480px) {
    .graph-heading { left: 13px; }
    .graph-tools, .graph-camera { right: 10px; }
    .graph-scope button { padding-inline: 5px; }
  }
</style>
