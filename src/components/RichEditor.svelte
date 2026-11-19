<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import type { ChainedCommands, Editor } from '@tiptap/core'
  import { Bold, CheckSquare, Code, Ellipsis, Heading2, Italic, List, ListOrdered, Plus, Quote, Redo2, Strikethrough, Underline, Undo2 } from '@lucide/svelte'
  import { blockCommands } from '../lib/block-commands.ts'
  import { followLink } from '../lib/links.ts'
  import { hydrateImages, transferredImages } from '../lib/attachments.ts'
  import { renderNote } from '../lib/markdown.ts'
  import { currentMatch, visualLink, visualMatch } from '../lib/search-reveal.ts'
  import { resolveNote, splitNote } from '../lib/notes.ts'
  import { wikiAttributes, wikiQuery } from '../lib/note-actions.ts'
  import { WikiPicker } from '../lib/wiki-picker.svelte.ts'
  import WikiSuggestions from './WikiSuggestions.svelte'
  import type { DocumentSession, Workspace } from '../lib/workspace.svelte.ts'

  let { document, workspace, onChange, onLink, onSource }: {
    document: DocumentSession; workspace: Workspace; onChange: (text: string) => void; onLink: (target: string) => void; onSource: () => void
  } = $props()

  let host: HTMLDivElement
  let scroller: HTMLDivElement
  let instance = $state.raw<Editor>()
  let SelectionToolbar = $state<typeof import('./SelectionToolbar.svelte').default>()
  let ready = $state(false)
  let reason = $state('')
  let marks = $state('')
  let formatting = $state<{ x: number; y: number; above: boolean }>()
  let toolbar = $state<HTMLDivElement>()
  let revision = $state(0)
  let pointerSelecting = false
  let dismissedSelection = ''
  let slash = $state<ReturnType<typeof menuPosition> & { from: number; to: number; value: string }>()
  let menu: HTMLDivElement | undefined = $state()
  let item = $state(0)
  let dismissedAt = -1
  let overflow = $state(false)
  let extra = $state<HTMLDivElement>()
  let extraButton = $state<HTMLButtonElement>()
  let searchKey: typeof import('../lib/editor-search.ts').searchDecoration | undefined
  let rendered = $state<HTMLDivElement>()
  $effect(() => { if (rendered) return hydrateImages(rendered, document.path, (path) => workspace.readImage(document.key, path)) })

  async function insertImages(files: File[], pos?: number) {
    const editor = instance, session = document
    if (!editor?.isEditable || !files.length) return
    let from = pos ?? editor.state.selection.from, to = pos ?? editor.state.selection.to
    let unavailable = false
    const track = ({ transaction }: { transaction: import('@tiptap/pm/state').Transaction }) => {
      const start = transaction.mapping.mapResult(from, 1), end = transaction.mapping.mapResult(to, -1)
      if (start.deleted && end.deleted) unavailable = true
      from = start.pos; to = Math.max(start.pos, end.pos)
    }
    editor.on('transaction', track)
    try {
      const images = []
      for (const file of files.slice(0, 12)) images.push(await workspace.attachImage(session, file))
      if (editor.isDestroyed || unavailable || workspace.currentDocument !== session) throw new Error('Image files were saved to Attachments, but the original insertion point is no longer available.')
      editor.off('transaction', track)
      if (!editor.chain().focus().insertContentAt({ from, to }, images.map((attrs) => ({ type: 'image', attrs }))).run()) throw new Error('Images cannot be inserted at this position.')
      session.syncView?.()
    } catch (error) { workspace.error = error instanceof Error ? error.message : String(error) }
    finally { if (!editor.isDestroyed) editor.off('transaction', track) }
  }

  function pasteImage(event: ClipboardEvent) {
    const files = transferredImages(event.clipboardData)
    if (files.length) { event.preventDefault(); event.stopPropagation(); void insertImages(files) }
  }

  function dropImage(event: DragEvent) {
    const files = transferredImages(event.dataTransfer)
    if (!files.length) return
    event.preventDefault(); event.stopPropagation()
    void insertImages(files, instance?.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos)
  }
  const picker = new WikiPicker(() => workspace.notes, () => document.path, async (choice, range) => {
    const editor = instance
    if (!editor) return
    const path = choice.create ? await workspace.createLinked(choice.create, document.path) : choice.path
    const attrs = wikiAttributes(path, document.path, workspace.notes)
    if (!attrs) throw new Error('That note cannot be linked unambiguously.')
    const current = picker.range
    if (!editor.isDestroyed && current?.from === range.from && current.to === range.to && current.query === range.query) {
      picker.hide()
      editor.chain().focus().insertContentAt({ from: range.from, to: range.to }, { type: 'wikiLink', attrs }).run()
      document.syncView?.()
    }
  })
  const formatGroups = [
    [
      { mark: 'bold', label: 'Bold', key: '⌘B', icon: Bold, run: (c: ChainedCommands) => c.toggleBold() },
      { mark: 'italic', label: 'Italic', key: '⌘I', icon: Italic, run: (c: ChainedCommands) => c.toggleItalic() },
      { mark: 'underline', label: 'Underline', key: '⌘U', icon: Underline, run: (c: ChainedCommands) => c.toggleUnderline() },
      { mark: 'code', label: 'Inline code', key: '', icon: Code, run: (c: ChainedCommands) => c.toggleCode() },
    ], [
      { mark: 'bulletList', label: 'Bullet list', key: '', icon: List, run: (c: ChainedCommands) => c.toggleBulletList() },
      { mark: 'orderedList', label: 'Numbered list', key: '', icon: ListOrdered, run: (c: ChainedCommands) => c.toggleOrderedList() },
      { mark: 'taskList', label: 'Task list', key: '', icon: CheckSquare, run: (c: ChainedCommands) => c.toggleTaskList() },
    ],
  ]
  const extras = [
    { label: 'Heading', icon: Heading2, run: (c: ChainedCommands) => c.toggleHeading({ level: 2 }) },
    { label: 'Block quote', icon: Quote, run: (c: ChainedCommands) => c.toggleBlockquote() },
    { label: 'Strikethrough', icon: Strikethrough, run: (c: ChainedCommands) => c.toggleStrike() },
    { label: 'Undo', icon: Undo2, run: (c: ChainedCommands) => c.undo() },
    { label: 'Redo', icon: Redo2, run: (c: ChainedCommands) => c.redo() },
  ]

  $effect(() => {
    const request = document.searchHit
    if (!ready || !instance || !request || !searchKey) return
    const editor = instance, key = searchKey
    untrack(() => {
      const match = currentMatch(document.text, request.match)
      if (!match) { document.searchHit = undefined; return }
      const visible = !reason && match.from >= splitNote(document.text).frontmatter.length && (match.link ? visualLink(editor.state.doc, match.link) : visualMatch(editor.state.doc, match.text, match.taskOrdinal))
      if (!visible) { onSource(); return }
      document.searchHit = undefined
      editor.view.dispatch(editor.state.tr.setMeta(key, visible))
      const coords = editor.view.coordsAtPos(visible.from)
      const bounds = scroller.getBoundingClientRect()
      scroller.scrollTop += coords.top - bounds.top - bounds.height * .4
    })
  })
  let matches = $derived(blockCommands.filter(({ label, terms }) => `${label} ${terms}`.toLowerCase().includes(slash?.value ?? '')))
  let groups = $derived.by(() => {
    const result = new Map<string, { block: (typeof blockCommands)[number]; index: number }[]>()
    matches.forEach((block, index) => {
      const group = result.get(block.group)
      if (group) group.push({ block, index }); else result.set(block.group, [{ block, index }])
    })
    return [...result]
  })

  $effect(() => {
    const input = instance?.view.dom
    if (!input) return
    if (picker.range) input.setAttribute('aria-controls', 'wiki-suggestions')
    else if (slash) input.setAttribute('aria-controls', 'block-commands')
    else input.removeAttribute('aria-controls')
    if (picker.range && picker.choices.length) input.setAttribute('aria-activedescendant', `wiki-option-${Math.min(picker.active, picker.choices.length - 1)}`)
    else if (slash && matches[item]) input.setAttribute('aria-activedescendant', `block-command-${item}`)
    else input.removeAttribute('aria-activedescendant')
  })

  function selectionChanged() {
    const editor = instance
    if (!editor) return
    marks = [...formatGroups.flat().map(({ mark }) => mark), 'table'].filter((mark) => editor.isActive(mark)).join(' ')
    updateFormatting(editor)
    const { empty, from, $from: position } = editor.state.selection
    const prefix = position.parent.textBetween(Math.max(0, position.parentOffset - 184), position.parentOffset, '\n', '\uFFFC')
    const suffix = position.parent.textBetween(position.parentOffset, Math.min(position.parent.content.size, position.parentOffset + 182), '\n', '\uFFFC')
    const wiki = empty && editor.view.hasFocus() && !editor.view.composing && !editor.isActive('codeBlock') && !editor.isActive('code') && !editor.isActive('link') && wikiQuery(prefix, suffix)
    if (wiki) {
      const start = from - prefix.length + wiki.from, end = from - prefix.length + wiki.to
      picker.update({ from: start, to: end, query: wiki.query }, editor.view.coordsAtPos(start))
      slash = undefined
      return
    }
    picker.update(undefined)
    if (!empty || editor.view.composing || editor.isActive('codeBlock') || editor.isActive('table')) { slash = undefined; return }
    const match = position.parentOffset <= 21 && /^\/([\w -]{0,20})$/.exec(prefix)
    if (!match) { dismissedAt = -1; slash = undefined; return }
    const start = from - match[0].length
    if (start === dismissedAt || (slash?.from === start && slash.to === from && slash.value === match[1].toLowerCase())) return
    const value = match[1].toLowerCase()
    const coords = slash?.from === start ? slash : menuPosition(editor, start)
    if (slash?.value !== value) {
      item = 0
      if (menu) menu.scrollTop = 0
    }
    slash = { ...coords, from: start, to: from, value }
  }

  function updateFormatting(editor = instance) {
    if (!editor) return
    const selection = editor.state.selection
    const { from, to, empty } = selection
    const signature = `${from}:${to}`
    if (empty) dismissedSelection = ''
    if (empty || selection.toJSON().type !== 'text' || pointerSelecting || editor.view.composing || signature === dismissedSelection || (!editor.view.hasFocus() && !toolbar?.contains(window.document.activeElement))) {
      formatting = undefined
      return
    }
    const fromRect = editor.view.coordsAtPos(from, 1)
    const toRect = editor.view.coordsAtPos(to, -1)
    const bounds = scroller.getBoundingClientRect()
    if (fromRect.top > bounds.bottom || toRect.bottom < bounds.top) { formatting = undefined; return }
    const above = fromRect.top - bounds.top >= 54 || bounds.bottom - toRect.bottom < 54
    const x = Math.abs(toRect.top - fromRect.top) < 3 ? (fromRect.left + toRect.left) / 2 : fromRect.left
    const y = above ? Math.max(bounds.top + 46, fromRect.top - 8) : toRect.bottom + 8
    revision++
    formatting = { x, y, above }
  }

  function closeFormatting() {
    if (instance) dismissedSelection = `${instance.state.selection.from}:${instance.state.selection.to}`
    formatting = undefined
  }

  function pointerDown(event: PointerEvent) {
    if (overflow && event.target instanceof Node && !extra?.contains(event.target)) overflow = false
    if (!(event.target instanceof Node) || toolbar?.contains(event.target)) return
    if (host?.contains(event.target) && event.button === 0) {
      pointerSelecting = true
      dismissedSelection = ''
      formatting = undefined
    } else if (formatting) closeFormatting()
  }

  function pointerUp() {
    if (!pointerSelecting) return
    pointerSelecting = false
    void tick().then(() => updateFormatting())
  }

  function focusChanged(event: FocusEvent) {
    if (picker.range && event.target instanceof Node && !host?.contains(event.target)) picker.hide()
    if (formatting && event.target instanceof Node && !host?.contains(event.target) && !toolbar?.contains(event.target)) closeFormatting()
  }

  function menuPosition(editor: Editor, start: number) {
    const caret = editor.view.coordsAtPos(start)
    const gap = 7
    const inset = 12
    const preferredHeight = 380
    const width = Math.min(384, window.innerWidth - inset * 2)
    const below = window.innerHeight - caret.bottom - gap - inset
    const aboveRoom = caret.top - gap - scroller.getBoundingClientRect().top
    const above = below < preferredHeight && aboveRoom > below
    return {
      x: Math.max(inset, Math.min(caret.left, window.innerWidth - width - inset)),
      y: above ? caret.top - gap : caret.bottom + gap,
      width,
      above,
      maxHeight: Math.max(0, Math.min(preferredHeight, above ? aboveRoom : below)),
    }
  }

  function selectBlock(index: number) {
    const editor = instance
    const block = matches[index]
    if (!editor || !block || !slash) return
    const { from, to } = slash
    slash = undefined
    block.apply(editor.chain().focus().deleteRange({ from, to })).run()
  }

  function handleSlashKeys(event: KeyboardEvent) {
    if (picker.key(event)) return
    if (formatting && event.key === 'Escape') { closeFormatting(); event.preventDefault(); event.stopImmediatePropagation(); return }
    if (formatting && event.altKey && event.key === 'F10') {
      toolbar?.querySelector('button')?.focus()
      event.preventDefault(); event.stopImmediatePropagation(); return
    }
    if (!slash || event.isComposing) return
    if (event.key === 'Escape') {
      dismissedAt = slash.from
      slash = undefined
    } else if (matches.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      item = (item + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length
      void tick().then(() => menu?.querySelector('button[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }))
    } else if (matches.length && event.key === 'Enter') selectBlock(item)
    else return
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  onMount(() => {
    const session = document
    const write = onChange
    let cancelled = false
    let queued = false
    let flush: (() => void) | undefined
    let onKey: ((event: KeyboardEvent) => void) | undefined
    void Promise.all([import('../lib/editor.ts'), import('./SelectionToolbar.svelte'), import('../lib/editor-search.ts')]).then(([{ createVisualEditor }, toolbarModule, searchModule]) => {
      if (cancelled) return
      searchKey = searchModule.searchDecoration
      SelectionToolbar = toolbarModule.default
      const visual = createVisualEditor(host, session.text, write, () => {
        if (queued) return
        queued = true
        queueMicrotask(() => { queued = false; if (!cancelled) selectionChanged() })
      }, { path: session.path, read: (path) => workspace.readImage(session.key, path) })
      instance = visual.editor
      flush = session.syncView = visual.flush
      reason = visual.reason
      ready = true
      if (reason) { session.jumpOutline = (_, line) => { session.outlineLine = { line }; onSource() }; return }
      session.captureView = () => {
        session.scrollTop = scroller.scrollTop
        session.richState = { from: visual.editor.state.selection.from, to: visual.editor.state.selection.to }
      }
      session.insertImages = (files) => void insertImages(files)
      session.jumpOutline = (ordinal, line) => {
        let count = 0, point: number | undefined
        visual.editor.state.doc.descendants((node, pos) => {
          if (point !== undefined) return false
          if (node.type.name === 'heading' && count++ === ordinal) point = pos + 1
        })
        if (point === undefined) { session.outlineLine = { line }; onSource(); return }
        visual.editor.commands.setTextSelection(point)
        const coords = visual.editor.view.coordsAtPos(point)
        scroller.scrollTop += coords.top - scroller.getBoundingClientRect().top - 26
        visual.editor.view.focus()
      }
      session.insertEmoji = (emoji) => {
        if (visual.editor.isDestroyed) return
        visual.editor.commands.command(({ tr }) => { tr.insertText(emoji); return true })
        visual.editor.view.focus()
        visual.flush()
      }
      const saved = session.richState as { from: number; to: number } | undefined
      const size = instance.state.doc.content.size
      if (saved && saved.from <= size && saved.to <= size) instance.commands.setTextSelection(saved)
      scroller.scrollTop = session.scrollTop
      rememberedScroll = scroller.scrollTop
      onKey = handleSlashKeys
      host.addEventListener('keydown', onKey, true)
      host.addEventListener('paste', pasteImage, true)
      host.addEventListener('drop', dropImage, true)
      if (instance.isEmpty && !session.searchHit) instance.commands.focus('start')
      selectionChanged()
    }).catch((error: unknown) => {
      if (!cancelled) { reason = 'Visual editing could not open this file.'; ready = true; console.error(error) }
    })

    return () => {
      cancelled = true
      flush?.()
      if (session.syncView === flush) session.syncView = undefined
      session.insertEmoji = undefined
      session.insertImages = undefined
      session.jumpOutline = undefined
      session.captureView = undefined
      if (!instance) return
      session.scrollTop = rememberedScroll
      if (onKey) host.removeEventListener('keydown', onKey, true)
      host.removeEventListener('paste', pasteImage, true)
      host.removeEventListener('drop', dropImage, true)
      session.richState = { from: instance.state.selection.from, to: instance.state.selection.to }
      instance.destroy()
    }
  })

  let rememberedScroll = 0
  function buttonDown(event: MouseEvent) { event.preventDefault() }
  function scrollEditor(event: Event & { currentTarget: HTMLDivElement }) {
    rememberedScroll = event.currentTarget.scrollTop
    slash = undefined
    picker.hide()
    if (formatting) updateFormatting()
  }
</script>

<svelte:window onpointerdown={pointerDown} onpointerup={pointerUp} onpointercancel={pointerUp} onfocusin={focusChanged} onkeydown={(event) => {
  if (overflow && event.key === 'Escape') { overflow = false; extraButton?.focus() }
}} onresize={() => {
  if (slash && instance) slash = { ...slash, ...menuPosition(instance, slash.from) }
  if (picker.range && instance) selectionChanged()
  if (formatting) updateFormatting()
}} />
<div class="rich-pane" bind:this={scroller} onscroll={scrollEditor}>
  <div class="document-column">
    {#if ready && !reason}
      <div class="format-toolbar" role="group" aria-label="Document formatting">
        {#each formatGroups as group, index (index)}
          {#if index}<span class="toolbar-divider" aria-hidden="true"></span>{/if}
          <div class="format-group">
            {#each group as action (action.mark)}
              <button type="button" class="icon-button" aria-label={action.label} data-tooltip={action.label} data-tooltip-key={action.key || undefined} aria-pressed={marks.split(' ').includes(action.mark)} onmousedown={buttonDown} onclick={() => { if (instance) action.run(instance.chain().focus()).run() }}><action.icon size={17} strokeWidth={1.65} /></button>
            {/each}
          </div>
        {/each}
        <span class="toolbar-divider" aria-hidden="true"></span>
        <div class="format-extra" bind:this={extra}>
          <button type="button" class="icon-button" bind:this={extraButton} aria-label="More document formatting" data-tooltip={overflow ? undefined : 'More formatting'} aria-expanded={overflow} onmousedown={buttonDown} onclick={async (event) => {
            overflow = !overflow
            if (overflow && event.detail === 0) { await tick(); extra?.querySelector<HTMLButtonElement>('.format-menu button')?.focus() }
          }}><Ellipsis size={16} /></button>
          {#if overflow}<div class="format-menu" role="group" aria-label="More formatting">
            {#each extras as action (action.label)}
              <button type="button" onmousedown={buttonDown} onclick={() => { overflow = false; if (instance) action.run(instance.chain().focus()).run() }}><action.icon size={15} strokeWidth={1.65} />{action.label}</button>
            {/each}
          </div>{/if}
        </div>
      </div>
        {#if marks.includes('table')}
          <div class="table-tools">
            <button type="button" onmousedown={buttonDown} onclick={() => instance?.chain().focus().addRowAfter().run()}><Plus size={12} /> Row</button>
            <button type="button" onmousedown={buttonDown} onclick={() => instance?.chain().focus().addColumnAfter().run()}><Plus size={12} /> Column</button>
          </div>
        {/if}
    {/if}
    {#if !ready}<p class="pane-message">Opening note…</p>{/if}
    {#if reason}
      <div class="source-notice"><span>{reason}</span><button type="button" onclick={onSource}>Open Editor</button></div>
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (delegates to native links) -->
      <div class="prose" bind:this={rendered} onclick={(event) => followLink(event, onLink)}>{@html renderNote(document.text)}</div>
    {/if}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (delegates to native links) -->
    <div class="prose rich-editor" hidden={!ready || !!reason} bind:this={host} onclick={(event) => followLink(event, onLink, true)}></div>
  </div>
</div>

{#if formatting && instance && SelectionToolbar && !slash}
  <SelectionToolbar editor={instance} {...formatting} {revision} linkSource={{ path: document.path, resolve: (target) => resolveNote(target, document.path, workspace.notes) }} close={closeFormatting} bind:element={toolbar} />
{/if}

{#if slash}
  <div class="slash-menu" class:above={slash.above} bind:this={menu} style:left="{slash.x}px" style:top="{slash.y}px" style:width="{slash.width}px" style:max-height="{slash.maxHeight}px" id="block-commands" role="listbox" aria-label="Insert block">
    {#each groups as [group, entries] (group)}
      <div class="slash-group" role="group" aria-label={group}>
        <div class="slash-section" aria-hidden="true">{group}</div>
        {#each entries as { block, index } (block.label)}
          <button type="button" role="option" id={`block-command-${index}`} tabindex="-1" aria-selected={item === index} onmousedown={buttonDown} onpointermove={() => { item = index }} onclick={() => selectBlock(index)}>
            <span class="slash-glyph" class:checkbox-glyph={block.badge} data-glyph={block.glyph} aria-hidden="true">
              {#if block.glyph === 'number'}1.{:else if block.glyph && block.glyph !== 'bullet'}Aa{:else if block.icon}<block.icon size={block.badge ? 12 : 16} strokeWidth={block.badge ? 2.2 : 1.6} />{/if}
            </span>
            <span>{block.label}</span>
          </button>
        {/each}
      </div>
    {:else}<p>No matching blocks</p>{/each}
  </div>
{/if}
<WikiSuggestions {picker} />
