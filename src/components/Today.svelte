<script lang="ts">
  import { CalendarDays, FileText } from '@lucide/svelte'
  import DocumentPane from './DocumentPane.svelte'
  import Dropdown from './Dropdown.svelte'
  import { localDate, validDate } from '../lib/notes.ts'
  import type { Workspace } from '../lib/workspace.svelte.ts'

  let { workspace }: { workspace: Workspace } = $props()
  const format = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const dates = $derived.by(() => {
    const today = localDate()
    const days = new Set([today, workspace.dailyDate])
    for (const { path } of workspace.notes) {
      const date = /^Daily\/(\d{4}-\d{2}-\d{2})\.md$/.exec(path)?.[1]
      if (date && validDate(date)) days.add(date)
    }
    return [...days].filter(Boolean).sort((a, b) => b.localeCompare(a)).map((day) => ({
      value: day, label: format.format(new Date(`${day}T12:00:00`)), detail: day === today ? 'Today' : undefined,
    }))
  })
</script>

<section class="today-page" aria-labelledby="today-heading">
  <header class="today-heading">
    <div><h1 id="today-heading">Today</h1><p>Daily notes</p></div>
    <Dropdown label="Daily entry" value={workspace.dailyDate} icon={CalendarDays} options={dates} searchable={dates.length > 8} disabled={workspace.editingFiles} onChange={(date) => void workspace.today(date)} />
  </header>
  {#if workspace.dailySession}
    {#key workspace.dailySession}
      {@const session = workspace.dailySession}
      <div class="document-shell" inert={workspace.editingFiles || workspace.trashingPath === session.path}>
        <DocumentPane document={session} {workspace} onChange={(text) => workspace.update(session, text)} onLink={(target) => void workspace.follow(target, session.path)} />
      </div>
    {/key}
  {:else if workspace.dailyLoading}
    <p class="pane-message" role="status">Opening daily note…</p>
  {:else}
    <div class="today-empty work-empty"><FileText size={22} strokeWidth={1.55} /><h2>No daily note here</h2><button class="button quiet" type="button" disabled={workspace.busy} onclick={() => void workspace.today()}>{workspace.dailyDate === localDate() ? 'Try again' : 'Go to today'}</button></div>
  {/if}
</section>
