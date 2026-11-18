<script lang="ts">
  import { noteName, type Task } from '../lib/notes.ts'
  import type { Workspace } from '../lib/workspace.svelte.ts'

  let { workspace }: { workspace: Workspace } = $props()
  let filter = $state<'open' | 'completed'>('open')
  let groups = $derived.by(() => [...workspace.tasksByFile.entries()].sort(([a], [b]) => noteName(a).localeCompare(noteName(b))).flatMap(([path, tasks]) => {
    const visible = tasks.filter((task) => task.checked === (filter === 'completed'))
    return visible.length ? [{ path, tasks: visible }] : []
  }))
  let working = $state('')
  async function change(task: Task) {
    working = task.path
    await workspace.changeTask(task)
    working = ''
  }
</script>

<div class="tasks-scroll">
  <section class="tasks-content">
    <h1>Tasks</h1>
    <p>Checkboxes from your Markdown notes.</p>
    <div class="task-filter" role="group" aria-label="Task status">
      <button type="button" aria-pressed={filter === 'open'} onclick={() => { filter = 'open' }}>Open</button>
      <button type="button" aria-pressed={filter === 'completed'} onclick={() => { filter = 'completed' }}>Completed</button>
    </div>
    {#each groups as group (group.path)}
      <section class="task-group">
        <h2><button type="button" onclick={() => void workspace.open(group.path)}>{noteName(group.path)}</button></h2>
        {#each group.tasks as task (task.line)}
          <label class="task-row"><input type="checkbox" checked={task.checked} disabled={!!working} onchange={(event) => { event.currentTarget.checked = task.checked; void change(task) }} /><span>{task.label}</span></label>
        {/each}
      </section>
    {:else}<p class="tasks-empty">{workspace.indexing ? 'Looking for tasks…' : filter === 'open' ? 'No open tasks. Add a checkbox to any note.' : 'No completed tasks yet.'}</p>{/each}
    {#if workspace.unreadableCount}<p class="tasks-empty">Some files could not be read. Open a file from the sidebar for details.</p>{/if}
  </section>
</div>
