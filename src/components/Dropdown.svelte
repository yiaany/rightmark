<script lang="ts" module>
  import type { Component } from 'svelte'
  export type DropdownOption = { value: string; label: string; detail?: string; icon?: Component<any>; disabled?: boolean }
</script>

<script lang="ts">
  import { tick } from 'svelte'
  import { Check, ChevronDown, Search } from '@lucide/svelte'

  let { label, value, options, onChange, placeholder = 'Choose…', disabled = false, searchable = false, quiet = false, stretch = false, icon: Icon }: {
    label: string; value?: string; options: DropdownOption[]; onChange: (value: string) => void;
    placeholder?: string; disabled?: boolean; searchable?: boolean; quiet?: boolean; stretch?: boolean; icon?: Component<any>;
  } = $props()
  const listId = $props.id()
  const selected = $derived(options.find((option) => option.value === value))
  let open = $state(false), query = $state(''), active = $state(-1)
  let root: HTMLDivElement, trigger: HTMLButtonElement
  let panel = $state<HTMLDivElement>(), search = $state<HTMLInputElement>()
  let geometry = $state('')
  let prefix = '', lastKey = 0
  const matches = $derived(options.filter((item) => !query || `${item.label} ${item.detail ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())))
  const activeId = $derived(open && matches[active] ? `${listId}-${active}` : undefined)

  function position() {
    if (!panel) return
    const rect = trigger.getBoundingClientRect()
    if (rect.bottom < 0 || rect.top > window.innerHeight || !rect.width) { dismiss(false); return }
    const floating = typeof panel.showPopover === 'function'
    const width = Math.min(Math.max(rect.width, searchable ? 248 : 174), window.innerWidth - 20)
    const left = Math.max(10, Math.min(rect.left, window.innerWidth - width - 10))
    const below = window.innerHeight - rect.bottom - 16, above = rect.top - 16
    const up = below < Math.min(300, panel.scrollHeight || 260) && above > below
    const height = Math.max(48, Math.min(320, up ? above : below))
    geometry = `width:${width}px;max-height:${height}px;left:${floating ? left : left - root.getBoundingClientRect().left}px;` + (floating
      ? up ? `bottom:${window.innerHeight - rect.top + 6}px` : `top:${rect.bottom + 6}px`
      : up ? 'bottom:calc(100% + 6px)' : 'top:calc(100% + 6px)')
  }

  function dismiss(focus: boolean) {
    if (!open) return
    if (panel && typeof panel.hidePopover === 'function' && panel.matches(':popover-open')) panel.hidePopover()
    open = false
    if (focus) trigger.focus({ preventScroll: true })
  }

  async function reveal(edge?: 'end') {
    if (disabled || !options.length || open) return
    query = ''; prefix = ''; lastKey = 0; open = true
    const index = options.findIndex((option) => option.value === value && !option.disabled)
    const enabled = options.flatMap((item, i) => item.disabled ? [] : [i])
    active = index >= 0 ? index : (edge === 'end' ? enabled.at(-1) : enabled[0]) ?? -1
    await tick()
    if (!panel || !open) return
    position()
    if (typeof panel.showPopover === 'function' && open) panel.showPopover()
    if (searchable) search?.focus({ preventScroll: true })
    scrollActive()
  }

  function scrollActive() {
    void tick().then(() => {
      const list = panel?.querySelector('.dropdown-options'), item = list?.querySelector(`[data-option="${active}"]`)
      if (!list || !item) return
      const inner = item.getBoundingClientRect(), outer = list.getBoundingClientRect()
      if (inner.top < outer.top) list.scrollTop += inner.top - outer.top
      else if (inner.bottom > outer.bottom) list.scrollTop += inner.bottom - outer.bottom
    })
  }

  function choose(index: number) {
    const item = matches[index]
    if (!item || item.disabled) return
    dismiss(true)
    onChange(item.value)
  }

  function handleKey(event: KeyboardEvent, inSearch = false) {
    if (event.isComposing) return
    const { key } = event
    if (key === 'Tab') { if (open) dismiss(inSearch); return }
    if (key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); dismiss(true); return
    }
    if (!open && ['ArrowUp', 'ArrowDown', 'Enter', ' '].includes(key)) {
      event.preventDefault(); void reveal(key === 'ArrowUp' ? 'end' : undefined); return
    }
    if (!open) return
    if (key === 'Enter' || (!inSearch && key === ' ')) { event.preventDefault(); choose(active); return }
    if (key === 'ArrowDown' || key === 'ArrowUp' || (!inSearch && (key === 'Home' || key === 'End'))) {
      event.preventDefault()
      const enabled = matches.flatMap((item, index) => item.disabled ? [] : [index])
      if (!enabled.length) return
      const index = enabled.indexOf(active)
      const next = key === 'Home' ? 0 : key === 'End' ? enabled.length - 1 : index < 0 ? (key === 'ArrowDown' ? 0 : enabled.length - 1) : (index + (key === 'ArrowDown' ? 1 : enabled.length - 1)) % enabled.length
      active = enabled[next]; scrollActive(); return
    }
    if (!inSearch && key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      const now = Date.now(), char = key.toLowerCase()
      prefix = now - lastKey < 650 && prefix !== char ? prefix + char : char; lastKey = now
      const ordered = [...matches.keys()].sort((a, b) => (a - active - 1 + matches.length) % matches.length - (b - active - 1 + matches.length) % matches.length)
      const next = ordered.find((index) => !matches[index].disabled && matches[index].label.toLowerCase().startsWith(prefix))
      if (next !== undefined) { active = next; scrollActive() }
    }
  }

  function outside(event: Event) { if (open && !event.composedPath().includes(root)) dismiss(false) }

  $effect(() => {
    if (!open) return
    const update = (event: Event) => { if (!panel || !event.composedPath().includes(panel)) position() }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update) }
  })
  $effect(() => { if (disabled || !options.length) dismiss(false) })
</script>

<svelte:window onpointerdown={outside} onfocusin={outside} />
<div class="dropdown" class:stretch bind:this={root}>
  <button type="button" class="dropdown-trigger" class:quiet bind:this={trigger} role="combobox" aria-label={selected ? `${label}: ${selected.label}` : label} aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={searchable ? undefined : activeId} aria-haspopup="listbox" disabled={disabled || !options.length}
    onclick={() => open ? dismiss(false) : void reveal()} onkeydown={(event) => handleKey(event)}>
    {#if Icon}<Icon size={15} strokeWidth={1.65} />{/if}<span>{selected?.label ?? placeholder}</span><ChevronDown size={13} strokeWidth={1.65} aria-hidden="true" />
  </button>
  {#if open}
    <div class="dropdown-panel" bind:this={panel} popover="manual" style={geometry}>
      {#if searchable}
        <label class="dropdown-search"><Search size={14} strokeWidth={1.65} /><input bind:this={search} type="search" placeholder="Filter options…" aria-label={`Filter ${label.toLowerCase()}`} role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls={listId} aria-activedescendant={activeId} value={query}
          oninput={(event) => { query = event.currentTarget.value; active = matches.findIndex((option) => !option.disabled); scrollActive() }} onkeydown={(event) => handleKey(event, true)} /></label>
      {/if}
      <div class="dropdown-options" role="listbox" id={listId} aria-label={label}>
        {#each matches as option, index (option.value)}
          <button type="button" role="option" id={`${listId}-${index}`} data-option={index} tabindex="-1" aria-selected={option.value === value} class:highlighted={active === index} disabled={option.disabled} onmousedown={(event) => event.preventDefault()} onpointermove={() => { if (!option.disabled) active = index }} onclick={() => choose(index)}>
            {#if option.icon}<option.icon size={15} strokeWidth={1.65} />{/if}<span><strong>{option.label}</strong>{#if option.detail}<small>{option.detail}</small>{/if}</span>
            {#if option.value === value}<Check size={14} strokeWidth={1.8} aria-hidden="true" />{/if}
          </button>
        {:else}<p role="status">No matching options</p>{/each}
      </div>
    </div>
  {/if}
</div>
