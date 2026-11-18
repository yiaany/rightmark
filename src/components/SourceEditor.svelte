<script lang="ts">
  import { onMount } from 'svelte'
  import type { editor } from 'monaco-editor'
  import type { DocumentSession } from '../lib/workspace.svelte.ts'

  let { document, onChange, onScroll, connect }: {
    document: DocumentSession; onChange: (text: string) => void;
    onScroll: (fraction: number) => void; connect: (go: ((fraction: number) => void) | undefined) => void
  } = $props()

  let host: HTMLDivElement
  let problem = $state(false)
  let ready = $state(false)

  onMount(() => {
    const session = document
    const write = onChange
    let cancelled = false
    let dispose: (() => void) | undefined
    void import('../lib/monaco.ts').then(({ mountMonaco }) => {
      if (cancelled) return
      const { instance, destroy } = mountMonaco(host, session.text, session.sourceState as editor.ICodeEditorViewState | null, write)
      let fromPreview = false
      connect((fraction) => {
        fromPreview = true
        instance.setScrollTop(fraction * Math.max(0, instance.getScrollHeight() - instance.getLayoutInfo().height), 1)
        fromPreview = false
      })
      const scrolling = instance.onDidScrollChange((event) => {
        if (!event.scrollTopChanged || fromPreview) return
        const range = event.scrollHeight - instance.getLayoutInfo().height
        if (range > 0) onScroll(event.scrollTop / range)
      })
      ready = true
      dispose = () => {
        session.sourceState = instance.saveViewState()
        connect(undefined)
        scrolling.dispose()
        destroy()
      }
    }).catch((error: unknown) => { if (!cancelled) { problem = true; console.error(error) } })
    return () => { cancelled = true; dispose?.() }
  })
</script>

<div class="source-editor" bind:this={host}>
  {#if problem}<textarea aria-label="Markdown source" value={document.text} oninput={(event) => onChange(event.currentTarget.value)}></textarea>
  {:else if !ready}<p class="pane-message">Opening source…</p>{/if}
</div>
