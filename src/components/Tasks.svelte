<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { ArrowUpRight, CalendarDays, FileText, ListChecks, Plus, Search } from '@lucide/svelte'
  import Dropdown from './Dropdown.svelte'
  import TaskDateField from './TaskDateField.svelte'
  import { localDate, noteFolder, noteName, taskLocation, taskTiming, type Task } from '../lib/notes.ts'
  import { taskFile, type Workspace } from '../lib/workspace.svelte.ts'

  let { workspace }: { workspace: Workspace } = $props()
  const statuses = ['Open', 'Today', 'Overdue', 'Completed', 'All'] as const
  let status = $state<(typeof statuses)[number]>('Open')
  let query = $state('')
  let file = $state('')
  let working = $state('')
  let today = $state(localDate()), editing = $state(''), date = $state('')
  let composing = $state(false), adding = $state(false), addError = $state(''), added = $state('')
  let title = $state(''), destination = $state(taskFile), due = $state(''), schedule = $state(false)
  let taskInput = $state<HTMLInputElement>(), newButton: HTMLButtonElement
  const destinations = $derived([
    { value: taskFile, label: 'Tasks.md', detail: 'Workspace root' },
    ...workspace.notes.filter(({ path }) => path !== taskFile && !path.startsWith('Templates/')).map(({ path }) => ({ value: path, label: noteName(path), detail: noteFolder(path) || 'Workspace root' })),
  ])
  const id = (task: Task) => `${task.path}:${task.line}`
  const dueDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
  const fullDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
  function dateLabel(value: string) {
    const date = new Date(`${value}T12:00:00`)
    return value.slice(0, 4) === today.slice(0, 4) ? dueDate.format(date) : fullDate.format(date)
  }
  onMount(() => {
    const update = () => { today = localDate() }
    window.addEventListener('focus', update)
    const timer = setInterval(update, 30_000)
    return () => { clearInterval(timer); window.removeEventListener('focus', update) }
  })
  let files = $derived([...workspace.tasksByFile.entries()].sort(([a], [b]) => noteName(a).localeCompare(noteName(b))))
  let tasks = $derived(files.flatMap(([, list]) => list))
  let counts = $derived({ Open: tasks.filter((task) => !task.checked).length, Today: tasks.filter((task) => taskTiming(task, today) === 'Today').length, Overdue: tasks.filter((task) => taskTiming(task, today) === 'Overdue').length, Completed: tasks.filter((task) => task.checked).length, All: tasks.length })
  let groups = $derived(files.flatMap(([path, tasks]) => {
    if (file && path !== file) return []
    const needle = query.trim().toLowerCase()
    const matches = tasks.filter((task) => (status === 'All' || (status === 'Open' && !task.checked) || (status === 'Completed' && task.checked) || status === taskTiming(task, today)) && (!needle || task.label.toLowerCase().includes(needle) || path.toLowerCase().includes(needle)))
    return matches.length ? [{ path, tasks: matches }] : []
  }))

  async function jump(task: Task) {
    try { const text = await workspace.read(task.path); await workspace.open(task.path, true, taskLocation(text, task)) }
    catch (error) { workspace.error = String(error) }
  }

  async function toggle(task: Task, due?: string) {
    working = id(task)
    try { await workspace.changeTask(task, due) } finally { working = ''; editing = '' }
  }

  async function editDate(task: Task, button: HTMLButtonElement) {
    if (editing === id(task)) { editing = ''; return }
    date = task.due ?? ''; editing = id(task)
    await tick(); button.closest('.task-item')?.querySelector<HTMLInputElement>('.task-date-field input')?.focus()
  }

  async function begin() {
    if (composing) { taskInput?.focus(); return }
    composing = true; addError = ''; added = ''; editing = ''
    destination = destinations.some((option) => option.value === file) ? file : taskFile
    due = status === 'Today' ? today : ''; schedule = !!due
    await tick(); taskInput?.focus()
  }

  function end() { composing = false; title = ''; due = ''; schedule = false; addError = ''; newButton?.focus() }

  async function add(event: SubmitEvent) {
    event.preventDefault()
    if (!title.trim() || adding) return
    adding = true; addError = ''
    try {
      await workspace.addTask(destination, title, due)
      added = `Task added to ${noteName(destination)}.`
      status = 'Open'; query = ''
      if (file && file !== destination) file = ''
      end()
    } catch (error) { addError = error instanceof Error ? error.message : String(error) }
    finally { adding = false }
  }
</script>

<section class="tasks-scroll" aria-labelledby="tasks-title">
  <div class="tasks-content">
    <header class="work-heading"><h1 id="tasks-title">Tasks</h1><div class="task-heading-actions">{#if counts.All}<span class="task-summary">{counts.Open} open <span aria-hidden="true">·</span> {counts.Completed} done</span>{/if}<button type="button" class="button secondary" bind:this={newButton} aria-expanded={composing} aria-controls={composing ? 'task-composer' : undefined} disabled={workspace.busy} onclick={() => void begin()}><Plus size={16} strokeWidth={1.65} /> New task</button></div></header>
    {#if composing}
      <form id="task-composer" class="task-composer" aria-label="New task" onsubmit={add}>
        <input class="task-title-input" type="text" aria-label="Task name" placeholder="What needs to be done?" bind:this={taskInput} bind:value={title} maxlength="500" required readonly={adding} />
        <div class="task-compose-tools">
          <Dropdown label="Save task to note" quiet icon={FileText} value={destination} options={destinations} searchable={destinations.length > 8} disabled={adding} onChange={(value) => { destination = value }} />
          {#if !schedule}<button class="button quiet" type="button" disabled={adding} onclick={() => { schedule = true }}><CalendarDays size={15} strokeWidth={1.6} /> Due date</button>{/if}
          <div class="task-compose-submit"><button class="button quiet" type="button" disabled={adding} onclick={end}>Cancel</button><button class="button primary" type="submit" disabled={adding || !title.trim()}>{adding ? 'Adding…' : 'Add task'}</button></div>
        </div>
        {#if schedule}<TaskDateField bind:value={due} disabled={adding} required={false} />{/if}
        {#if addError}<p class="inbox-error" role="alert">{addError}</p>{/if}
      </form>
    {/if}
    {#if added}<p class="task-added" role="status">{added}</p>{/if}
    <div class="task-controls">
      <nav class="page-tabs task-scopes" aria-label="Task status">
        {#each statuses as item (item)}<button type="button" aria-current={status === item ? 'true' : undefined} onclick={() => { status = item; editing = '' }}>{item}{#if (item === 'Today' || item === 'Overdue') && counts[item]}<span class="tab-count">{counts[item]}</span>{/if}</button>{/each}
      </nav>
      <div class="task-filters">
        <label class="work-search"><Search size={15} aria-hidden="true" /><input type="search" aria-label="Filter tasks" placeholder="Filter tasks…" bind:value={query} /></label>
        <Dropdown label="Filter by note" value={file} icon={FileText} searchable={files.length > 8} options={[{ value: '', label: 'All notes' }, ...files.map(([path]) => ({ value: path, label: noteName(path), detail: noteFolder(path) || 'Workspace' }))]} onChange={(value) => { file = value; editing = '' }} />
      </div>
    </div>
    {#each groups as group (group.path)}
      <section class="task-group">
        <h2><button type="button" onclick={() => void workspace.open(group.path)}><FileText size={15} strokeWidth={1.65} /><strong>{noteName(group.path)}</strong>{#if noteFolder(group.path)}<small>{noteFolder(group.path)}</small>{/if}</button></h2>
        {#each group.tasks as task (task.line)}
          <div class="task-item"><div class="task-row" class:done={task.checked}>
            <label><input type="checkbox" checked={task.checked} disabled={!!working} onchange={(event) => { event.currentTarget.checked = task.checked; void toggle(task) }} /><span>{task.label}</span></label>
            <button type="button" class="task-date" class:overdue={taskTiming(task, today) === 'Overdue'} class:unscheduled={!task.due} aria-expanded={editing === id(task)} disabled={!!working} aria-label={task.due ? `Due ${task.due}; change date for ${task.label}` : `Set due date: ${task.label}`} data-tooltip={task.due ? `Due ${task.due}` : 'Set due date'} onclick={(event) => void editDate(task, event.currentTarget)}><CalendarDays size={14} strokeWidth={1.6} />{#if task.due}<time datetime={task.due}>{taskTiming(task, today) === 'Today' ? 'Today' : dateLabel(task.due)}</time>{/if}</button>
            <button type="button" class="icon-button task-jump" aria-label={`Jump to task: ${task.label}`} data-tooltip="Jump to task" onclick={() => void jump(task)}><ArrowUpRight size={16} strokeWidth={1.65} /></button>
          </div>
          {#if editing === id(task)}<form class="task-date-form" onsubmit={(event) => { event.preventDefault(); void toggle(task, date) }}>
            <TaskDateField bind:value={date} disabled={!!working} />
            <div class="task-date-actions"><button type="submit" class="button secondary" disabled={!!working}>Set date</button>
              {#if task.due}<button type="button" class="button quiet" disabled={!!working} onclick={() => void toggle(task, '')}>Clear</button>{/if}
              <button type="button" class="button quiet" onclick={() => { editing = ''; }}>Cancel</button>
            </div>
          </form>{/if}</div>
        {/each}
      </section>
    {:else}
      <div class="work-empty"><ListChecks size={24} strokeWidth={1.5} /><h2>{workspace.indexing ? 'Finding tasks…' : query || file ? 'No matching tasks' : status === 'Today' ? 'Nothing due today' : status === 'Overdue' ? 'Nothing overdue' : status === 'Open' ? 'No open tasks' : 'No tasks here yet'}</h2><p>{workspace.indexing ? 'Reading Markdown files.' : query || file ? 'Try another search or note.' : status === 'Today' || status === 'Overdue' ? 'Set a due date on an open task to track it here.' : 'Add a checkbox to any note and it will appear here.'}</p></div>
    {/each}
    {#if workspace.unreadableCount}<p class="subtle-empty">Some files could not be read. Open a file from the sidebar for details.</p>{/if}
  </div>
</section>
