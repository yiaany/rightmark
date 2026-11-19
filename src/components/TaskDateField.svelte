<script lang="ts">
  import { tick } from 'svelte'
  import { CalendarDays, ChevronLeft, ChevronRight } from '@lucide/svelte'
  import { localDate, validDate } from '../lib/notes.ts'

  let { value = $bindable(''), disabled = false, required = true }: { value?: string; disabled?: boolean; required?: boolean } = $props()
  const calendarId = $props.id()
  let open = $state(false)
  let month = $state(new Date()), active = $state('')
  let calendar = $state<HTMLDivElement>(), trigger: HTMLButtonElement
  let input = $state<HTMLInputElement>()
  const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
  const fullDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' })
  const weekdays = Array.from({ length: 7 }, (_, index) => weekday.format(new Date(2024, 0, 7 + index)))
  const first = $derived(at(month.getFullYear(), month.getMonth(), 1))
  const days = $derived(Array.from({ length: Math.ceil((first.getDay() + at(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7 }, (_, index) => at(month.getFullYear(), month.getMonth(), 1 + index - first.getDay())))
  $effect(() => { input?.setCustomValidity(!value || validDate(value) ? '' : 'Enter a valid date in YYYY-MM-DD format.') })

  function at(year: number, month: number, day: number) {
    const date = new Date(2000, 0, 1, 12)
    date.setFullYear(year, month, day)
    return date
  }

  function focusDay() {
    void tick().then(() => calendar?.querySelector<HTMLButtonElement>('button[data-active="true"]')?.focus({ preventScroll: true }))
  }

  function toggle() {
    open = !open
    if (!open) return
    const date = new Date(`${value}T12:00:00`)
    month = validDate(value) ? date : new Date()
    active = localDate(month)
    focusDay()
  }

  function turn(step: number) {
    const next = at(month.getFullYear(), month.getMonth() + step, 1)
    if (next.getFullYear() < 1 || next.getFullYear() > 9999) return
    month = next; active = localDate(next)
  }

  function choose(date: string) { value = date; open = false; trigger.focus() }

  function dayKey(event: KeyboardEvent, date: Date) {
    const shift = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]
    if (shift === undefined) return
    event.preventDefault()
    const next = at(date.getFullYear(), date.getMonth(), date.getDate() + shift)
    if (next.getFullYear() < 1 || next.getFullYear() > 9999) return
    month = next; active = localDate(next); focusDay()
  }
</script>

<div class="task-date-field">
  <div class="date-input-row">
    <input class="work-input" type="text" aria-label="Due date" placeholder="YYYY-MM-DD" autocomplete="off" {required} pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxlength="10" bind:this={input} bind:value {disabled} />
    <button class="icon-button" type="button" aria-label="Choose date from calendar" aria-expanded={open} aria-controls={open ? calendarId : undefined} bind:this={trigger} onclick={toggle} {disabled}><CalendarDays size={15} strokeWidth={1.6} /></button>
  </div>
  {#if open}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions (Escape closes the calendar from any of its buttons) -->
    <div class="date-calendar" id={calendarId} role="group" aria-label="Calendar" bind:this={calendar}
      onkeydown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); open = false; trigger.focus() } }}>
      <header><button class="icon-button" type="button" aria-label="Previous month" onclick={() => turn(-1)} {disabled}><ChevronLeft size={15} /></button><strong aria-live="polite">{monthFormat.format(month)}</strong><button class="icon-button" type="button" aria-label="Next month" onclick={() => turn(1)} {disabled}><ChevronRight size={15} /></button></header>
      <div class="date-grid">
        {#each weekdays as name, index (index)}<span aria-hidden="true">{name}</span>{/each}
        {#each days as day (+day)}
          {@const key = localDate(day)}
          <button type="button" tabindex={active === key ? 0 : -1} data-active={active === key} class:date-other={day.getMonth() !== month.getMonth()}
            aria-pressed={value === key} aria-label={fullDate.format(day)} disabled={disabled || day.getFullYear() < 1 || day.getFullYear() > 9999}
            onclick={() => choose(key)} onkeydown={(event) => dayKey(event, day)}>{day.getDate()}</button>
        {/each}
      </div>
    </div>
  {/if}
</div>
