<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import type { editor } from 'monaco-editor'
  import { sourcePosition } from '../lib/notes.ts'
  import { currentMatch } from '../lib/search-reveal.ts'
  import type { DocumentSession } from '../lib/workspace.svelte.ts'

  let { document, onChange, onScroll, connect }: {
    document: DocumentSession; onChange: (text: string) => void;
    onScroll: (fraction: number) => void; connect: (go: ((fraction: number) => void) | undefined) => void
  } = $props()

  let host: HTMLDivElement
  let problem = $state(false)
  let ready = $state(false)
  let source = $state.raw<editor.IStandaloneCodeEditor>()
  let fallback = $state<HTMLTextAreaElement>()

  $effect(() => {
    const request = document.searchHit
    if (!request || (!source && !fallback)) return
    const text = untrack(() => document.text)
    const match = currentMatch(text, request.match)
    document.searchHit = undefined
    if (!match) return
    if (source) {
      const start = sourcePosition(text, match.from), end = sourcePosition(text, match.to)
      const range = { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column }
      source.setSelection(range)
      source.revealRangeInCenter(range, 1)
      source.focus()
    } else if (fallback) {
      fallback.focus()
      fallback.setSelectionRange(match.from, match.to)
    }
  })

  onMount(() => {
    const session = document
    const write = onChange
    let cancelled = false
    let dispose: (() => void) | undefined
    void import('../lib/monaco.ts').then(({ mountMonaco }) => {
      if (cancelled) return
      const { instance, destroy } = mountMonaco(host, session.text, session.sourceState as editor.ICodeEditorViewState | null, write)
      source = instance
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
  {#if problem}<textarea bind:this={fallback} aria-label="Markdown source" spellcheck={false} autocorrect="off" autocapitalize="off" autocomplete="off" value={document.text} oninput={(event) => onChange(event.currentTarget.value)}></textarea>
  {:else if !ready}<p class="pane-message">Opening source…</p>{/if}
</div>
