<script lang="ts">
  import { onMount, tick } from 'svelte'
  import type { Editor } from '@tiptap/core'
  import { Bold, Check, Code, Italic, List, Plus } from '@lucide/svelte'
  import { blockCommands } from '../lib/block-commands.ts'
  import { followLink } from '../lib/links.ts'
  import { renderNote } from '../lib/markdown.ts'
  import type { DocumentSession } from '../lib/workspace.svelte.ts'

  let { document, onChange, onLink, onSource }: {
    document: DocumentSession; onChange: (text: string) => void; onLink: (target: string) => void; onSource: () => void
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
    if (slash) input.setAttribute('aria-controls', 'block-commands')
    else input.removeAttribute('aria-controls')
    if (slash && matches[item]) input.setAttribute('aria-activedescendant', `block-command-${item}`)
    else input.removeAttribute('aria-activedescendant')
  })

  function selectionChanged() {
    const editor = instance
    if (!editor) return
    marks = ['bold', 'italic', 'code', 'taskList', 'table'].filter((mark) => editor.isActive(mark)).join(' ')
    updateFormatting(editor)
    const { empty, from, $from: position } = editor.state.selection
    if (!empty || editor.view.composing || editor.isActive('codeBlock') || editor.isActive('table')) { slash = undefined; return }
    const match = /^\/([\w -]{0,20})$/.exec(position.parent.textBetween(0, position.parentOffset, '\n'))
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
    const above = fromRect.top - bounds.top >= 51 || bounds.bottom - toRect.bottom < 51
    const x = Math.abs(toRect.top - fromRect.top) < 3 ? (fromRect.left + toRect.left) / 2 : fromRect.left
    const y = above ? Math.max(bounds.top + 44, fromRect.top - 8) : toRect.bottom + 8
    revision++
    formatting = { x, y, above }
  }

  function closeFormatting() {
    if (instance) dismissedSelection = `${instance.state.selection.from}:${instance.state.selection.to}`
    formatting = undefined
  }

  function pointerDown(event: PointerEvent) {
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
    let flush: (() => void) | undefined
    let onKey: ((event: KeyboardEvent) => void) | undefined
    void Promise.all([import('../lib/editor.ts'), import('./SelectionToolbar.svelte')]).then(([{ createVisualEditor }, toolbarModule]) => {
      if (cancelled) return
      SelectionToolbar = toolbarModule.default
      const visual = createVisualEditor(host, session.text, write, selectionChanged)
      instance = visual.editor
      flush = session.syncView = visual.flush
      reason = visual.reason
      ready = true
      if (reason) return
      const saved = session.richState as { from: number; to: number } | undefined
      const size = instance.state.doc.content.size
      if (saved && saved.from <= size && saved.to <= size) instance.commands.setTextSelection(saved)
      scroller.scrollTop = session.scrollTop
      onKey = handleSlashKeys
      host.addEventListener('keydown', onKey, true)
      if (!session.text) instance.commands.focus('start')
    }).catch((error: unknown) => {
      if (!cancelled) { reason = 'Visual editing could not open this file.'; ready = true; console.error(error) }
    })

    return () => {
      cancelled = true
      flush?.()
      if (session.syncView === flush) session.syncView = undefined
      if (!instance) return
      session.scrollTop = rememberedScroll
      if (onKey) host.removeEventListener('keydown', onKey, true)
      session.richState = { from: instance.state.selection.from, to: instance.state.selection.to }
      instance.destroy()
    }
  })

  let rememberedScroll = 0
  function buttonDown(event: MouseEvent) { event.preventDefault() }
  function scrollEditor(event: Event & { currentTarget: HTMLDivElement }) {
    rememberedScroll = event.currentTarget.scrollTop
    slash = undefined
    if (formatting) updateFormatting()
  }
</script>

<svelte:window onpointerdown={pointerDown} onpointerup={pointerUp} onpointercancel={pointerUp} onfocusin={focusChanged} onresize={() => {
  if (slash && instance) slash = { ...slash, ...menuPosition(instance, slash.from) }
  if (formatting) updateFormatting()
}} />
<div class="rich-pane" bind:this={scroller} onscroll={scrollEditor}>
  <div class="document-column">
    {#if ready && !reason}
      <div class="format-toolbar" role="group" aria-label="Formatting">
        <button type="button" class="icon-button" aria-label="Bold" data-tooltip="Bold" data-tooltip-key="⌘B" aria-pressed={marks.includes('bold')} onmousedown={buttonDown} onclick={() => instance?.chain().focus().toggleBold().run()}><Bold size={16} /></button>
        <button type="button" class="icon-button" aria-label="Italic" data-tooltip="Italic" data-tooltip-key="⌘I" aria-pressed={marks.includes('italic')} onmousedown={buttonDown} onclick={() => instance?.chain().focus().toggleItalic().run()}><Italic size={16} /></button>
        <button type="button" class="icon-button" aria-label="Inline code" data-tooltip="Inline code" aria-pressed={marks.includes('code')} onmousedown={buttonDown} onclick={() => instance?.chain().focus().toggleCode().run()}><Code size={16} /></button>
        <span class="toolbar-divider"></span>
        <button type="button" class="icon-button" aria-label="Bullet list" data-tooltip="Bullet list" onmousedown={buttonDown} onclick={() => instance?.chain().focus().toggleBulletList().run()}><List size={16} /></button>
        <button type="button" class="icon-button" aria-label="Task list" data-tooltip="Task list" aria-pressed={marks.includes('taskList')} onmousedown={buttonDown} onclick={() => instance?.chain().focus().toggleTaskList().run()}><Check size={16} /></button>
        {#if marks.includes('table')}
          <div class="table-tools">
            <button type="button" onmousedown={buttonDown} onclick={() => instance?.chain().focus().addRowAfter().run()}><Plus size={12} /> Row</button>
            <button type="button" onmousedown={buttonDown} onclick={() => instance?.chain().focus().addColumnAfter().run()}><Plus size={12} /> Column</button>
          </div>
        {/if}
      </div>
    {/if}
    {#if !ready}<p class="pane-message">Opening note…</p>{/if}
    {#if reason}
      <div class="source-notice"><span>{reason}</span><button type="button" onclick={onSource}>Open Editor</button></div>
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (delegates to native links) -->
      <div class="prose" onclick={(event) => followLink(event, onLink)}>{@html renderNote(document.text)}</div>
    {/if}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (delegates to native links) -->
    <div class="prose rich-editor" hidden={!ready || !!reason} bind:this={host} onclick={(event) => followLink(event, onLink, true)}></div>
  </div>
</div>

{#if formatting && instance && SelectionToolbar && !slash}
  <SelectionToolbar editor={instance} {...formatting} {revision} close={closeFormatting} bind:element={toolbar} />
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
