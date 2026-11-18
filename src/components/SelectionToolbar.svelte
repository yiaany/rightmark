<script lang="ts">
  import { tick } from 'svelte'
  import type { Editor } from '@tiptap/core'
  import { ArrowDown, ArrowUp, Bold, ChevronDown, CodeXml, Ellipsis, Italic, Link2, RemoveFormatting, Strikethrough, Underline, Unlink2 } from '@lucide/svelte'
  import { blockAt, moveBlock } from '../lib/block-move.ts'
  import { normalizeEditorLink } from '../lib/editor-link.ts'

  let { editor, x, y, above, revision, close, element = $bindable() }: {
    editor: Editor; x: number; y: number; above: boolean; revision: number; close: () => void; element?: HTMLDivElement
  } = $props()

  const formats = [
    { name: 'bold', label: 'Bold', shortcut: '⌘B', icon: Bold, run: (e: Editor) => e.chain().focus().toggleBold().run() },
    { name: 'italic', label: 'Italic', shortcut: '⌘I', icon: Italic, run: (e: Editor) => e.chain().focus().toggleItalic().run() },
    { name: 'strike', label: 'Strikethrough', icon: Strikethrough, run: (e: Editor) => e.chain().focus().toggleStrike().run() },
    { name: 'underline', label: 'Underline', shortcut: '⌘U', icon: Underline, run: (e: Editor) => e.chain().focus().toggleUnderline().run() },
    { name: 'code', label: 'Inline code', icon: CodeXml, run: (e: Editor) => e.chain().focus().toggleCode().run() },
  ] as const
  const styles = [{ label: 'Regular Text', level: 0 }, { label: 'Title', level: 1 }, { label: 'Heading', level: 2 }, { label: 'Subheading', level: 3 }] as const
  let popup = $state<'style' | 'link' | 'more'>()
  let width = $state(0)
  let input = $state<HTMLInputElement>()
  let url = $state('')
  let error = $state('')
  let center = $derived(Math.max(width / 2 + 8, Math.min(x, window.innerWidth - width / 2 - 8)))
  let popupAbove = $derived(window.innerHeight - (above ? y : y + 38) < 138 && y > 186)
  let current = $derived.by(() => {
    revision
    const block = blockAt(editor.state.doc, editor.state.selection.head)
    return {
      marks: new Set([...formats.map(({ name }) => name), 'link'].filter((name) => editor.isActive(name))),
      level: [1, 2, 3].find((level) => editor.isActive('heading', { level })) ?? 0,
      canMoveUp: !!block && block.index > 0,
      canMoveDown: !!block && block.index < block.parent.childCount - 1,
    }
  })

  function preserve(event: MouseEvent) { event.preventDefault() }

  async function toggle(next: typeof popup) {
    popup = popup === next ? undefined : next
    if (popup === 'link') {
      url = editor.getAttributes('link').href ?? ''
      error = ''
      await tick()
      input?.focus()
      input?.select()
    }
  }

  function saveLink(event: SubmitEvent) {
    event.preventDefault()
    const href = normalizeEditorLink(url)
    if (!href) { error = 'Enter a valid URL or Markdown path.'; return }
    popup = undefined
    editor.chain().focus().setLink({ href }).run()
  }

  function changeStyle(level: (typeof styles)[number]['level']) {
    popup = undefined
    const chain = editor.chain().focus()
    if (level) chain.setHeading({ level }).run()
    else chain.setParagraph().run()
  }

  function move(by: -1 | 1) {
    const block = blockAt(editor.state.doc, editor.state.selection.head)
    const tr = block && moveBlock(editor.state, block, block.index + (by < 0 ? -1 : 2))
    if (!tr) return
    popup = undefined
    editor.view.dispatch(tr)
    editor.view.focus()
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const buttons = [...(element?.querySelectorAll<HTMLButtonElement>(':scope > button') ?? [])]
      const index = buttons.indexOf(event.target as HTMLButtonElement)
      if (index >= 0) {
        const direction = event.key === 'ArrowLeft' ? -1 : 1
        buttons[(index + direction + buttons.length) % buttons.length].focus()
        event.preventDefault()
      }
      return
    }
    if (event.key !== 'Escape') return
    event.preventDefault(); event.stopPropagation()
    if (popup) { popup = undefined; editor.view.focus() }
    else { close(); editor.view.focus() }
  }
</script>

<div class="selection-toolbar" class:above class:popup-above={popupAbove} bind:this={element} bind:offsetWidth={width} style:left="{center}px" style:top="{y}px" role="toolbar" tabindex="-1" aria-label="Text formatting" onkeydown={onKey}>
  <button type="button" class="text-style-button" aria-label="Text style" data-tooltip="Text style" aria-expanded={popup === 'style'} onmousedown={preserve} onclick={() => void toggle('style')}>Aa <ChevronDown size={11} /></button>
  <span class="selection-separator" aria-hidden="true"></span>
  {#each formats as format (format.name)}
    <button type="button" aria-label={format.label} data-tooltip={format.label} data-tooltip-key={'shortcut' in format ? format.shortcut : undefined} aria-pressed={current.marks.has(format.name)} onmousedown={preserve} onclick={() => { popup = undefined; format.run(editor) }}><format.icon size={16} strokeWidth={1.65} /></button>
  {/each}
  <span class="selection-separator" aria-hidden="true"></span>
  <button type="button" aria-label={current.marks.has('link') ? 'Edit link' : 'Add link'} data-tooltip={current.marks.has('link') ? 'Edit link' : 'Add link'} class:linked={current.marks.has('link')} aria-expanded={popup === 'link'} onmousedown={preserve} onclick={() => void toggle('link')}><Link2 size={17} strokeWidth={1.6} /></button>
  <button type="button" aria-label="More formatting options" data-tooltip="More formatting options" aria-expanded={popup === 'more'} onmousedown={preserve} onclick={() => void toggle('more')}><Ellipsis size={17} strokeWidth={1.75} /></button>

  {#if popup === 'style'}
    <div class="selection-popover selection-styles" role="group" aria-label="Text style options">
      {#each styles as style (style.level)}
        <button type="button" aria-pressed={current.level === style.level} onmousedown={preserve} onclick={() => changeStyle(style.level)}><span class="style-glyph" data-level={style.level} aria-hidden="true">Aa</span>{style.label}</button>
      {/each}
    </div>
  {:else if popup === 'link'}
    <form class="selection-popover selection-link" onsubmit={saveLink}>
      <label for="selection-link-url">Link address</label>
      <div>
        <input id="selection-link-url" aria-invalid={!!error} bind:this={input} bind:value={url} oninput={() => { error = '' }} placeholder="https://… or Note.md" spellcheck={false} autocorrect="off" autocapitalize="off" autocomplete="off" />
        <button type="submit">Apply</button>
      </div>
      {#if error}<p role="alert">{error}</p>{/if}
      {#if current.marks.has('link')}<button class="remove-link" type="button" onmousedown={preserve} onclick={() => { popup = undefined; editor.chain().focus().unsetLink().run() }}><Unlink2 size={14} /> Remove link</button>{/if}
    </form>
  {:else if popup === 'more'}
    <div class="selection-popover selection-more" role="group" aria-label="Additional formatting options">
      <button type="button" onmousedown={preserve} onclick={() => { popup = undefined; editor.chain().focus().unsetAllMarks().run() }}><RemoveFormatting size={15} /> Clear formatting</button>
      <button type="button" disabled={!current.canMoveUp} onmousedown={preserve} onclick={() => move(-1)}><ArrowUp size={15} /> Move block up</button>
      <button type="button" disabled={!current.canMoveDown} onmousedown={preserve} onclick={() => move(1)}><ArrowDown size={15} /> Move block down</button>
    </div>
  {/if}
</div>
