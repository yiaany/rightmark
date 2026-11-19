<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import type { editor } from 'monaco-editor'
  import { sourcePosition, splitNote } from '../lib/notes.ts'
  import { currentMatch } from '../lib/search-reveal.ts'
  import { noteReferences } from '../lib/markdown.ts'
  import { markdownImage, transferredImages } from '../lib/attachments.ts'
  import { wikiAttributes, wikiQuery } from '../lib/note-actions.ts'
  import { WikiPicker } from '../lib/wiki-picker.svelte.ts'
  import WikiSuggestions from './WikiSuggestions.svelte'
  import type { DocumentSession, Workspace } from '../lib/workspace.svelte.ts'

  let { document, workspace, onChange, onLink, onScroll, connect }: {
    document: DocumentSession; workspace: Workspace; onChange: (text: string) => void; onLink: (target: string) => void;
    onScroll: (fraction: number) => void; connect: (go: ((fraction: number) => void) | undefined) => void
  } = $props()

  let host: HTMLDivElement
  let problem = $state(false)
  let ready = $state(false)
  let source = $state.raw<editor.IStandaloneCodeEditor>()
  let fallback = $state<HTMLTextAreaElement>()
  $effect(() => {
    const field = fallback, session = document
    if (!field) return
    const state = session.sourceState as { fallback?: { start: number; end: number; scroll: number } } | undefined
    if (state?.fallback) {
      field.setSelectionRange(state.fallback.start, state.fallback.end)
      field.scrollTop = state.fallback.scroll
    }
    const capture = () => { session.sourceState = { fallback: { start: field.selectionStart, end: field.selectionEnd, scroll: field.scrollTop } } }
    session.captureView = capture
    return () => { capture(); if (session.captureView === capture) session.captureView = undefined }
  })

  async function insertImages(files: File[], position?: { lineNumber: number; column: number }) {
    const session = document, instance = source, model = instance?.getModel(), field = fallback
    const version = model?.getVersionId(), initial = field?.value
    const selection = position ? { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column } : instance?.getSelection()
    const start = field?.selectionStart ?? 0, end = field?.selectionEnd ?? 0
    try {
      const images = []
      for (const file of files.slice(0, 12)) images.push(markdownImage(await workspace.attachImage(session, file)))
      const text = `\n\n${images.join('\n\n')}\n\n`
      if (workspace.currentDocument !== session || (model ? source !== instance || model.getVersionId() !== version : !field || field !== fallback || field.value !== initial)) throw new Error('Image files were saved to Attachments, but the original insertion point is no longer available.')
      if (instance && selection) {
        instance.pushUndoStop()
        instance.executeEdits('insert-images', [{ range: selection, text }])
        instance.pushUndoStop(); instance.focus()
      } else if (field) {
        field.setRangeText(text, start, end, 'end'); onChange(field.value); field.focus()
      }
    } catch (error) { workspace.error = error instanceof Error ? error.message : String(error) }
  }

  function pasteImage(event: ClipboardEvent) {
    const files = transferredImages(event.clipboardData)
    if (files.length) { event.preventDefault(); event.stopPropagation(); void insertImages(files) }
  }

  function dropImage(event: DragEvent) {
    const files = transferredImages(event.dataTransfer)
    if (!files.length) return
    event.preventDefault(); event.stopPropagation()
    const pos = source?.getTargetAtClientPoint(event.clientX, event.clientY)?.position
    void insertImages(files, pos ?? undefined)
  }
  const picker = new WikiPicker(() => workspace.notes, () => document.path, async (choice, range) => {
    const instance = source, model = instance?.getModel()
    if (!instance || !model) return
    const version = model.getVersionId()
    const path = choice.create ? await workspace.createLinked(choice.create, document.path) : choice.path
    const attrs = wikiAttributes(path, document.path, workspace.notes)
    if (!attrs) throw new Error('That note cannot be linked unambiguously.')
    if (source !== instance || instance.getModel() !== model || model.getVersionId() !== version || !picker.range || picker.range.from !== range.from || picker.range.to !== range.to) return
    const start = model.getPositionAt(range.from), end = model.getPositionAt(range.to)
    const text = `[[${attrs.target}${attrs.label ? `|${attrs.label}` : ''}]]`
    picker.hide()
    instance.pushUndoStop()
    instance.executeEdits('wiki-suggestions', [{ range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column }, text }])
    instance.setPosition(model.getPositionAt(range.from + text.length))
    instance.pushUndoStop()
    instance.focus()
  })

  function updatePicker() {
    const instance = source, model = instance?.getModel(), selection = instance?.getSelection()
    if (!instance || !model || !selection?.isEmpty() || !instance.hasTextFocus()) { picker.update(undefined); return }
    const { positionLineNumber: line, positionColumn: column } = selection, text = model.getLineContent(line)
    const prefix = text.slice(0, column - 1)
    const query = wikiQuery(prefix, text.slice(column - 1))
    if (!query) { picker.update(undefined); return }
    const lineStart = model.getOffsetAt({ lineNumber: line, column: 1 })
    if (lineStart + query.from < splitNote(document.text).frontmatter.length || (prefix.match(/`+/g)?.length ?? 0) % 2) { picker.update(undefined); return }
    // Do not offer note links inside fenced code in Markdown source.
    let fence = ''
    for (let n = 1; n <= line; n++) {
      const marker = /^\s*(?:>\s*)*(`{3,}|~{3,})(.*)$/.exec(model.getLineContent(n))
      if (!marker) continue
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = ''
      if (n === line) { picker.update(undefined); return }
    }
    const coords = instance.getScrolledVisiblePosition({ lineNumber: line, column: query.from + 1 })
    if (fence || !coords || coords.top < 0 || coords.top > host.clientHeight) { picker.update(undefined); return }
    const rect = host.getBoundingClientRect()
    picker.update({ from: lineStart + query.from, to: lineStart + query.to, query: query.query }, { left: rect.left + coords.left, top: rect.top + coords.top, bottom: rect.top + coords.top + coords.height })
  }

  $effect(() => {
    const input = source?.getDomNode()?.querySelector('[role="textbox"]')
    if (!input) return
    if (picker.range && picker.choices.length) {
      input.setAttribute('aria-controls', 'wiki-suggestions')
      input.setAttribute('aria-activedescendant', `wiki-option-${Math.min(picker.active, picker.choices.length - 1)}`)
    } else { input.removeAttribute('aria-controls'); input.removeAttribute('aria-activedescendant') }
  })

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

  $effect(() => {
    const request = document.outlineLine
    if (!request || (!source && !fallback)) return
    untrack(() => {
      const { line } = request
      if (source) { source.setPosition({ lineNumber: line, column: 1 }); source.revealLineInCenter(line, 1); source.focus() }
      else if (fallback) {
        let offset = 0
        for (let n = 1; n < line; n++) offset = document.text.indexOf('\n', offset) + 1
        fallback.focus(); fallback.setSelectionRange(offset, offset)
        fallback.scrollTop = Math.max(0, (line - 3) * 23)
      }
      document.outlineLine = undefined
    })
  })

  onMount(() => {
    const session = document
    const write = onChange
    session.insertImages = (files) => void insertImages(files)
    session.jumpOutline = (_, line) => { session.outlineLine = { line } }
    host.addEventListener('paste', pasteImage, true)
    host.addEventListener('drop', dropImage, true)
    let cancelled = false
    let dispose: (() => void) | undefined
    void import('../lib/monaco.ts').then(({ mountMonaco, contentTextTarget }) => {
      if (cancelled) return
      const saved = session.sourceState as editor.ICodeEditorViewState | null
      const { instance, destroy } = mountMonaco(host, session.text, saved?.viewState ? saved : null, write)
      source = instance
      session.captureView = () => { session.sourceState = instance.saveViewState() }
      session.insertEmoji = (emoji) => {
        const selection = instance.getSelection()
        if (!selection) return
        instance.pushUndoStop()
        instance.executeEdits('insert-emoji', [{ range: selection, text: emoji }])
        instance.pushUndoStop()
        instance.focus()
      }
      let fromPreview = false
      connect((fraction) => {
        fromPreview = true
        instance.setScrollTop(fraction * Math.max(0, instance.getScrollHeight() - instance.getLayoutInfo().height), 1)
        fromPreview = false
      })
      const scrolling = instance.onDidScrollChange((event) => {
        if (picker.range) updatePicker()
        if (!event.scrollTopChanged || fromPreview) return
        const range = event.scrollHeight - instance.getLayoutInfo().height
        if (range > 0) onScroll(event.scrollTop / range)
      })
      const cursor = instance.onDidChangeCursorSelection(updatePicker)
      const blur = instance.onDidBlurEditorText(() => picker.hide())
      const linkClick = instance.onMouseUp(({ event, target }) => {
        if (!(event.metaKey || event.ctrlKey) || !event.leftButton || target.type !== contentTextTarget || !target.position) return
        const model = instance.getModel()
        if (!model) return
        const offset = model.getOffsetAt(target.position)
        const link = noteReferences(model.getValue()).find(({ match }) => match.from <= offset && offset < match.to)
        if (link) onLink(link.target)
      })
      const key = (event: KeyboardEvent) => { picker.key(event) }
      host.addEventListener('keydown', key, true)
      ready = true
      dispose = () => {
        session.sourceState = instance.saveViewState()
        connect(undefined)
        scrolling.dispose()
        cursor.dispose(); blur.dispose(); linkClick.dispose()
        host.removeEventListener('keydown', key, true)
        source = undefined
        destroy()
      }
    }).catch((error: unknown) => { if (!cancelled) {
      problem = true; console.error(error)
      session.insertEmoji = (emoji) => {
        if (!fallback) return
        fallback.setRangeText(emoji, fallback.selectionStart, fallback.selectionEnd, 'end')
        write(fallback.value); fallback.focus()
      }
    } })
    return () => {
      cancelled = true; session.insertEmoji = undefined; session.insertImages = undefined; session.jumpOutline = undefined; session.captureView = undefined
      host.removeEventListener('paste', pasteImage, true); host.removeEventListener('drop', dropImage, true); dispose?.()
    }
  })
</script>

<div class="source-editor" bind:this={host}>
  {#if problem}<textarea bind:this={fallback} aria-label="Markdown source" spellcheck={false} autocorrect="off" autocapitalize="off" autocomplete="off" value={document.text} oninput={(event) => onChange(event.currentTarget.value)}></textarea>
  {:else if !ready}<p class="pane-message">Opening source…</p>{/if}
</div>
<WikiSuggestions {picker} />
