<script lang="ts">
  import { tick } from 'svelte'
  import type { Editor } from '@tiptap/core'
  import { ArrowDown, ArrowUp, Bold, Check, ChevronDown, CodeXml, Ellipsis, Highlighter, Italic, Link2, RemoveFormatting, Strikethrough, Underline, Unlink2 } from '@lucide/svelte'
  import { blockAt, moveBlock } from '../lib/block-move.ts'
  import { normalizeEditorLink } from '../lib/editor-link.ts'
  import { editorPalette, isEditorColor, type EditorColor } from '../lib/editor-palette.ts'

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
  type ColorMode = 'textColor' | 'highlight'
  const colorModes = [{ id: 'textColor', label: 'Text color' }, { id: 'highlight', label: 'Highlight' }] as const
  let popup = $state<'style' | 'link' | 'more' | ColorMode>()
  let width = $state(0)
  let palette = $state<HTMLDivElement>()
  let input = $state<HTMLInputElement>()
  let url = $state('')
  let error = $state('')
  let center = $derived(Math.max(width / 2 + 8, Math.min(x, window.innerWidth - width / 2 - 8)))
  let paletteOpen = $derived(popup === 'textColor' || popup === 'highlight')
  let roomAbove = $derived((above ? y - 38 : y) - 13)
  let roomBelow = $derived(window.innerHeight - (above ? y : y + 38) - 13)
  let popupAbove = $derived(roomBelow < (paletteOpen ? 382 : 130) && roomAbove > roomBelow)
  let paletteHeight = $derived(Math.max(0, Math.floor(popupAbove ? roomAbove : roomBelow)))
  let current = $derived.by(() => {
    revision
    const block = blockAt(editor.state.doc, editor.state.selection.head)
    return {
      marks: new Set([...formats.map(({ name }) => name), 'link'].filter((name) => editor.isActive(name))),
      textColor: selectedColor('textColor'),
      highlight: selectedColor('highlight'),
      level: [1, 2, 3].find((level) => editor.isActive('heading', { level })) ?? 0,
      canMoveUp: !!block && block.index > 0,
      canMoveDown: !!block && block.index < block.parent.childCount - 1,
    }
  })

  function selectedColor(mode: ColorMode) {
    const color: unknown = editor.getAttributes(mode).color
    return isEditorColor(color) && editor.isActive(mode, { color }) ? color : undefined
  }

  function changeColor(mode: ColorMode, color?: EditorColor) {
    popup = undefined
    const chain = editor.chain().focus()
    if (color) chain.setMark(mode, { color }).run()
    else chain.unsetMark(mode).run()
  }

  function preserve(event: MouseEvent) { event.preventDefault() }

  async function toggle(next: typeof popup, keyboard = false) {
    popup = popup === next ? undefined : next
    if (popup === 'link') {
      url = editor.getAttributes('link').href ?? ''
      error = ''
      await tick()
      input?.focus()
      input?.select()
    } else if (keyboard && (popup === 'textColor' || popup === 'highlight')) {
      await tick()
      const focus = palette?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ?? palette?.querySelector('button')
      focus?.focus()
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
    const inPalette = paletteOpen && palette?.contains(event.target as Node)
    if (inPalette ? ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) : ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      const buttons = [...(inPalette ? palette?.querySelectorAll<HTMLButtonElement>('button') ?? [] : element?.querySelectorAll<HTMLButtonElement>(':scope > button') ?? [])]
      const index = buttons.indexOf(event.target as HTMLButtonElement)
      if (index >= 0) {
        const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + direction + buttons.length) % buttons.length
        buttons[next].focus()
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
  <span class="selection-separator" aria-hidden="true"></span>
  {#each colorModes as mode (mode.id)}
    <button type="button" class="selection-color-button" aria-label={mode.label} data-tooltip={mode.label} aria-expanded={popup === mode.id} data-palette={current[mode.id]} onmousedown={preserve} onclick={(event) => void toggle(mode.id, event.detail === 0)}>
      {#if mode.id === 'textColor'}<span class="ink-glyph" aria-hidden="true">A</span>{:else}<Highlighter class="highlight-glyph" size={15} strokeWidth={1.65} />{/if}
    </button>
  {/each}
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
  {:else if popup === 'textColor' || popup === 'highlight'}
    {@const mode = popup}
    {@const label = mode === 'textColor' ? 'Text color' : 'Highlight'}
    <div class="selection-popover selection-palette" class:ink-palette={mode === 'textColor'} bind:this={palette} style:max-height="{paletteHeight}px" role="group" aria-label={label}>
      <button type="button" aria-pressed={!current[mode]} onmousedown={preserve} onclick={() => changeColor(mode)}>
        <span class="palette-dot" aria-hidden="true"></span><span>Default</span>
        {#if !current[mode]}<Check class="palette-check" size={15} strokeWidth={1.6} />{/if}
      </button>
      {#each editorPalette as color (color.id)}
        <button type="button" data-palette={color.id} aria-pressed={current[mode] === color.id} onmousedown={preserve} onclick={() => changeColor(mode, color.id)}>
          <span class="palette-dot" aria-hidden="true"></span><span>{color.label}</span>
          {#if current[mode] === color.id}<Check class="palette-check" size={15} strokeWidth={1.6} />{/if}
        </button>
      {/each}
    </div>
  {:else if popup === 'more'}
    <div class="selection-popover selection-more" role="group" aria-label="Additional formatting options">
      <button type="button" onmousedown={preserve} onclick={() => { popup = undefined; editor.chain().focus().unsetAllMarks().run() }}><RemoveFormatting size={15} /> Clear formatting</button>
      <button type="button" disabled={!current.canMoveUp} onmousedown={preserve} onclick={() => move(-1)}><ArrowUp size={15} /> Move block up</button>
      <button type="button" disabled={!current.canMoveDown} onmousedown={preserve} onclick={() => move(1)}><ArrowDown size={15} /> Move block down</button>
    </div>
  {/if}
</div>
