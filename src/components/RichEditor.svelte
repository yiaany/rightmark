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
  let instance: Editor | undefined
  let ready = $state(false)
  let reason = $state('')
  let marks = $state('')
  let slash = $state<{ from: number; to: number; x: number; y: number; above: boolean; maxHeight: number; value: string }>()
  let menu: HTMLDivElement | undefined = $state()
  let item = $state(0)
  let dismissedAt = -1
  let matches = $derived(blockCommands.filter(({ label, terms }) => `${label} ${terms}`.toLowerCase().includes(slash?.value ?? '')))

  $effect(() => {
    const active = slash && matches[item] ? `block-command-${item}` : undefined
    const input = instance?.view.dom
    if (active) input?.setAttribute('aria-activedescendant', active)
    else input?.removeAttribute('aria-activedescendant')
  })

  function selectionChanged() {
    const editor = instance
    if (!editor) return
    marks = ['bold', 'italic', 'code', 'taskList', 'table'].filter((mark) => editor.isActive(mark)).join(' ')
    const { empty, from, $from: position } = editor.state.selection
    if (!empty || editor.view.composing || editor.isActive('codeBlock') || editor.isActive('table')) { slash = undefined; return }
    const match = /^\/([\w -]{0,20})$/.exec(position.parent.textBetween(0, position.parentOffset, '\n'))
    if (!match) { dismissedAt = -1; slash = undefined; return }
    const start = from - match[0].length
    if (start === dismissedAt || (slash?.from === start && slash.to === from && slash.value === match[1].toLowerCase())) return
    const value = match[1].toLowerCase()
    const coords = slash?.from === start ? slash : menuPosition(editor, start)
    if (slash?.value !== value) item = 0
    slash = { ...coords, from: start, to: from, value }
  }

  function menuPosition(editor: Editor, start: number) {
    const caret = editor.view.coordsAtPos(start)
    const below = window.innerHeight - caret.bottom - 30
    const above = below < 242 && caret.top - 44 > below
    return {
      x: Math.max(10, Math.min(caret.left, window.innerWidth - 254)),
      y: above ? caret.top - 6 : caret.bottom + 6,
      above,
      maxHeight: Math.max(80, Math.min(320, above ? caret.top - 46 : below)),
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
    void import('../lib/editor.ts').then(({ createVisualEditor }) => {
      if (cancelled) return
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
</script>

<div class="rich-pane" bind:this={scroller} onscroll={(event) => { rememberedScroll = event.currentTarget.scrollTop; slash = undefined }}>
  <div class="document-column">
    {#if ready && !reason}
      <div class="format-toolbar" role="group" aria-label="Formatting">
        <button type="button" class="icon-button" aria-label="Bold" title="Bold" aria-pressed={marks.includes('bold')} onmousedown={buttonDown} onclick={() => instance?.chain().focus().toggleBold().run()}><Bold size={16} /></button>
        <button type="button" class="icon-button" aria-label="Italic" title="Italic" aria-pressed={marks.includes('italic')} onmousedown={buttonDown} onclick={() => instance?.chain().focus().toggleItalic().run()}><Italic size={16} /></button>
        <button type="button" class="icon-button" aria-label="Inline code" title="Inline code" aria-pressed={marks.includes('code')} onmousedown={buttonDown} onclick={() => instance?.chain().focus().toggleCode().run()}><Code size={16} /></button>
        <span class="toolbar-divider"></span>
        <button type="button" class="icon-button" aria-label="Bullet list" title="Bullet list" onmousedown={buttonDown} onclick={() => instance?.chain().focus().toggleBulletList().run()}><List size={16} /></button>
        <button type="button" class="icon-button" aria-label="Task list" title="Task list" aria-pressed={marks.includes('taskList')} onmousedown={buttonDown} onclick={() => instance?.chain().focus().toggleTaskList().run()}><Check size={16} /></button>
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

{#if slash}
  <div class="slash-menu" class:above={slash.above} bind:this={menu} style:left="{slash.x}px" style:top="{slash.y}px" style:max-height="{slash.maxHeight}px" id="block-commands" role="listbox" aria-label="Insert block">
    {#each matches as block, index (block.label)}
      {#if index === 0 || matches[index - 1].group !== block.group}<div class="slash-section" role="presentation">{block.group}</div>{/if}
      <button type="button" role="option" id={`block-command-${index}`} tabindex="-1" aria-selected={item === index} onmousedown={buttonDown} onpointermove={() => { item = index }} onclick={() => selectBlock(index)}><block.icon size={15} strokeWidth={1.55} /><span>{block.label}</span></button>
    {:else}<p>No matching blocks</p>{/each}
  </div>
{/if}
