<script lang="ts">
  import { onMount } from 'svelte'
  import type { Editor } from '@tiptap/core'
  import { Bold, CheckSquare, Code, Heading1, Heading2, Italic, List, ListOrdered, Pilcrow, Quote } from '@lucide/svelte'
  import { followLink } from '../lib/links.ts'
  import { renderNote } from '../lib/markdown.ts'
  import type { DocumentSession } from '../lib/workspace.svelte.ts'

  let { document, onChange, onLink, onSource }: {
    document: DocumentSession; onChange: (text: string) => void; onLink: (target: string) => void; onSource: () => void
  } = $props()

  const blocks = [
    { label: 'Text', icon: Pilcrow, command: (editor: Editor) => editor.chain().focus().setParagraph().run() },
    { label: 'Heading 1', icon: Heading1, command: (editor: Editor) => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { label: 'Heading 2', icon: Heading2, command: (editor: Editor) => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: 'Bullet list', icon: List, command: (editor: Editor) => editor.chain().focus().toggleBulletList().run() },
    { label: 'Numbered list', icon: ListOrdered, command: (editor: Editor) => editor.chain().focus().toggleOrderedList().run() },
    { label: 'Task list', icon: CheckSquare, command: (editor: Editor) => editor.chain().focus().toggleTaskList().run() },
    { label: 'Quote', icon: Quote, command: (editor: Editor) => editor.chain().focus().toggleBlockquote().run() },
    { label: 'Code block', icon: Code, command: (editor: Editor) => editor.chain().focus().toggleCodeBlock().run() },
  ]

  let host: HTMLDivElement
  let scroller: HTMLDivElement
  let instance: Editor | undefined
  let ready = $state(false)
  let reason = $state('')
  let marks = $state('')
  let slash = $state<{ from: number; to: number; x: number; y: number; value: string }>()
  let item = $state(0)
  let dismissedAt = -1
  let matches = $derived(blocks.filter(({ label }) => label.toLowerCase().includes(slash?.value ?? '')))

  function selectionChanged() {
    const editor = instance
    if (!editor) return
    marks = ['bold', 'italic', 'code', 'taskList'].filter((mark) => editor.isActive(mark)).join(' ')
    const { empty, from, $from: position } = editor.state.selection
    if (!empty || editor.isActive('codeBlock')) { slash = undefined; return }
    const match = /^\/([\w -]{0,20})$/.exec(position.parent.textBetween(0, position.parentOffset, '\n'))
    if (!match) { dismissedAt = -1; slash = undefined; return }
    const start = from - match[0].length
    if (start === dismissedAt) return
    const coords = editor.view.coordsAtPos(from)
    const x = Math.max(12, Math.min(coords.left, window.innerWidth - 228))
    const y = coords.bottom + 260 > window.innerHeight ? Math.max(50, coords.top - Math.min(256, blocks.length * 30)) : coords.bottom + 6
    const value = match[1].toLowerCase()
    if (slash?.value !== value) item = 0
    slash = { from: start, to: from, x, y, value }
  }

  function selectBlock(index: number) {
    const editor = instance
    const block = matches[index]
    if (!editor || !block || !slash) return
    const { from, to } = slash
    slash = undefined
    editor.chain().focus().deleteRange({ from, to }).run()
    block.command(editor)
  }

  function handleSlashKeys(event: KeyboardEvent) {
    if (!slash || event.isComposing) return
    if (event.key === 'Escape') {
      dismissedAt = slash.from
      slash = undefined
    } else if (matches.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      item = (item + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length
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
        <button type="button" class="icon-button" aria-label="Task list" title="Task list" aria-pressed={marks.includes('taskList')} onmousedown={buttonDown} onclick={() => instance?.chain().focus().toggleTaskList().run()}><CheckSquare size={15} /></button>
        <span class="format-help"><kbd>/</kbd> for blocks</span>
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
  <div class="slash-menu" style:left="{slash.x}px" style:top="{slash.y}px" role="group" aria-label="Insert block">
    {#each matches as block, index (block.label)}
      <button class:highlighted={item === index} type="button" onmousedown={buttonDown} onclick={() => selectBlock(index)}><block.icon size={15} />{block.label}</button>
    {:else}<p>No matching blocks</p>{/each}
  </div>
{/if}
