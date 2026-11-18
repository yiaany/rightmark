<script lang="ts">
  import { untrack } from 'svelte'
  import { Link2, Unlink2 } from '@lucide/svelte'
  import RichEditor from './RichEditor.svelte'
  import SourceEditor from './SourceEditor.svelte'
  import { renderNote } from '../lib/markdown.ts'
  import { followLink } from '../lib/links.ts'
  import type { DocumentSession } from '../lib/workspace.svelte.ts'

  let { document, onChange, onLink }: { document: DocumentSession; onChange: (text: string) => void; onLink: (target: string) => void } = $props()
  let preview: HTMLDivElement | undefined = $state()
  let previewText = $state('')
  let linked = $state(false)
  let split = $state(50)
  let source: ((fraction: number) => void) | undefined
  let scrollTarget: number | undefined
  let panes: HTMLDivElement | undefined = $state()

  $effect(() => {
    if (document.mode !== 'split') return
    const text = document.text
    if (!untrack(() => previewText)) previewText = text
    const timer = setTimeout(() => { previewText = text }, 90)
    return () => clearTimeout(timer)
  })

  function fromSource(fraction: number) {
    if (!linked || !preview) return
    const next = fraction * (preview.scrollHeight - preview.clientHeight)
    if (Math.abs(preview.scrollTop - next) > 1) { scrollTarget = next; preview.scrollTop = next }
  }

  function fromPreview() {
    if (!linked || !preview) return
    if (scrollTarget !== undefined && Math.abs(preview.scrollTop - scrollTarget) < 1) { scrollTarget = undefined; return }
    scrollTarget = undefined
    const range = preview.scrollHeight - preview.clientHeight
    if (range > 0) source?.(preview.scrollTop / range)
  }

  function startResize(event: PointerEvent) {
    if (event.button === 0) (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function resize(event: PointerEvent) {
    if (!(event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) return
    const rect = panes?.getBoundingClientRect()
    if (!rect) return
    setSplit((event.clientX - rect.left) / rect.width * 100)
  }

  function setSplit(value: number) { split = Math.min(72, Math.max(28, value)) }
</script>

{#if document.mode === 'preview'}
  <RichEditor {document} {onChange} {onLink} onSource={() => { document.mode = 'editor' }} />
{:else}
  <div class="editor-panes" class:is-split={document.mode === 'split'} bind:this={panes} style:grid-template-columns={document.mode === 'split' ? `minmax(0, ${split}fr) 7px minmax(0, ${100 - split}fr)` : 'minmax(0, 1fr)'}>
    <section class="source-pane" aria-label="Source pane">
      {#if document.mode === 'split'}<div class="pane-label">Markdown</div>{/if}
      <SourceEditor {document} {onChange} onScroll={fromSource} connect={(go) => { source = go }} />
    </section>
    {#if document.mode === 'split'}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (the window splitter pattern is keyboard operable) -->
      <div class="splitter" role="separator" aria-label="Resize editor and preview" aria-orientation="vertical" aria-valuenow={split} aria-valuemin={28} aria-valuemax={72} tabindex="0"
        onpointerdown={startResize} onpointermove={resize} ondblclick={() => setSplit(50)}
        onkeydown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setSplit(split + (event.key === 'ArrowLeft' ? -3 : 3)) }
        }}></div>
      <section class="preview-pane" aria-label="Live preview">
        <div class="pane-label">Live preview
          <button type="button" class="icon-button" aria-pressed={linked} aria-label="Link pane scrolling" title="Link pane scrolling" onclick={() => { linked = !linked }}>{#if linked}<Link2 size={15} />{:else}<Unlink2 size={15} />{/if}</button>
        </div>
        <div class="split-preview" bind:this={preview} onscroll={fromPreview}>
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (delegates to native links) -->
          <div class="prose" onclick={(event) => followLink(event, onLink)}>{@html renderNote(previewText)}</div>
        </div>
      </section>
    {/if}
  </div>
{/if}
