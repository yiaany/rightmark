<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { Search, X } from '@lucide/svelte'
  import Dropdown from './Dropdown.svelte'

  type Emoji = { label: string; unicode: string; group?: number; order?: number; tags?: string[]; skins?: Emoji[] }
  let { onPick, dismiss }: { onPick: (value: string) => void; dismiss: () => void } = $props()
  let dialog: HTMLDialogElement, field: HTMLInputElement
  let grid = $state<HTMLDivElement>()
  let catalog = $state.raw<Emoji[]>([]), error = $state(false)
  let group = $state('0'), query = $state(''), active = $state(0), limit = $state(96)
  const groups = ['Smileys', 'People', '', 'Animals & nature', 'Food & drink', 'Travel & places', 'Activities', 'Objects', 'Symbols', 'Flags']
  const options = groups.flatMap((label, index) => label ? [{ label, value: String(index) }] : [])
  const matches = $derived.by(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
    if (!words.length) return catalog.filter((entry) => entry.group === Number(group))
    const showTones = words.includes('tone') || words.includes('skin')
    return catalog.flatMap((entry) => {
      const hay = `${entry.label} ${entry.tags?.join(' ') ?? ''} ${entry.unicode}`.toLowerCase()
      const result = words.every((word) => hay.includes(word)) ? [entry] : []
      if (showTones) for (const skin of entry.skins ?? []) if (words.every((word) => `${skin.label} ${hay}`.includes(word))) result.push(skin)
      return result
    })
  })
  const shown = $derived(matches.slice(0, limit))

  onMount(() => {
    const element = dialog
    element.showModal(); field.focus()
    let cancelled = false
    void import('emojibase-data/en/compact.json').then(({ default: entries }) => {
      if (!cancelled) catalog = (entries as Emoji[]).filter((entry) => entry.group !== undefined && entry.group !== 2).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }).catch(() => { if (!cancelled) error = true })
    return () => { cancelled = true; element.close() }
  })

  function reset() { active = 0; limit = 96; grid?.parentElement?.scrollTo(0, 0) }
  async function focusEmoji(index: number) {
    active = Math.max(0, Math.min(index, shown.length - 1))
    await tick(); grid?.querySelector<HTMLButtonElement>(`[data-emoji-index="${active}"]`)?.focus()
  }
  function move(event: KeyboardEvent, index: number) {
    if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); void focusEmoji(event.key === 'Home' ? 0 : shown.length - 1); return }
    const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 1
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[event.key]
    if (offset === undefined) return
    event.preventDefault()
    if (offset < -1 && index + offset < 0) field.focus()
    else void focusEmoji(index + offset)
  }
</script>

<dialog class="emoji-dialog" aria-labelledby="emoji-heading" bind:this={dialog} oncancel={(event) => { event.preventDefault(); dismiss() }} onclick={(event) => { if (event.target === dialog) dismiss() }}>
  <header><h2 id="emoji-heading">Insert emoji</h2><button type="button" class="icon-button" aria-label="Close emoji picker" onclick={dismiss}><X size={17} strokeWidth={1.7} /></button></header>
  <div class="emoji-tools">
    <label class="emoji-search"><Search size={16} strokeWidth={1.65} /><input type="search" aria-label="Search emoji" placeholder="Search emoji…" bind:this={field} bind:value={query} oninput={reset}
      onkeydown={(event) => { if (!event.isComposing && event.key === 'ArrowDown' && shown.length) { event.preventDefault(); void focusEmoji(0) } else if (!event.isComposing && event.key === 'Enter' && shown[0]) { event.preventDefault(); onPick(shown[0].unicode) } }} /></label>
    {#if !query.trim()}<Dropdown label="Emoji category" value={group} {options} onChange={(value) => { group = value; reset() }} />{/if}
  </div>
  <div class="emoji-results">
    {#if error}<p role="alert">Could not load emoji. On macOS, you can still use the system emoji picker.</p>
    {:else if !catalog.length}<p role="status">Loading emoji…</p>
    {:else if !shown.length}<p role="status">No matching emoji.</p>
    {:else}
      <div class="emoji-grid" role="group" aria-label="Emoji results" bind:this={grid}>
        {#each shown as emoji, index (emoji.unicode)}
          <button type="button" data-emoji-index={index} tabindex={index === active ? 0 : -1} aria-label={emoji.label} data-tooltip={emoji.label}
            onfocus={() => { active = index }} onkeydown={(event) => move(event, index)} onclick={() => onPick(emoji.unicode)}>{emoji.unicode}</button>
        {/each}
      </div>
      {#if shown.length < matches.length}<button type="button" class="button quiet emoji-more" onclick={async () => { const next = limit; limit += 96; await focusEmoji(next) }}>Show more</button>{/if}
    {/if}
  </div>
</dialog>
