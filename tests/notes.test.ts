import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { appendTask, findText, moveTab, resolveNote, scanTasks, searchNotes, sourcePosition, splitNote, taskLocation, toggleTask } from '../src/lib/notes.ts'

test('appending tasks preserves existing Markdown, CRLF, and Unicode', () => {
  const prior = '---\r\ntags: things\r\n---\r\n\r\n- [x] Previous\r\n'
  const next = appendTask(prior, '  Plan the rollout 🚀  ', '2026-11-20')
  assert.equal(next, prior + '\r\n- [ ] Plan the rollout 🚀 📅 2026-11-20\r\n')
  const task = scanTasks('Tasks.md', next).at(-1)
  assert.equal(task?.label, 'Plan the rollout 🚀')
  assert.equal(task?.due, '2026-11-20')
  assert.equal(appendTask('', 'Plain task'), '- [ ] Plain task\n')
})

test('appending a task does not silently insert it into an unclosed fenced block or comment', () => {
  assert.throws(() => appendTask('```md\ntext', 'Plan the rollout'), /unfinished/)
  assert.throws(() => appendTask('<!--\ntext', 'Plan the rollout'), /unfinished/)
  assert.throws(() => appendTask('', 'Not\na line'), /one line/)
  assert.throws(() => appendTask('', 'Task', '2026-02-30'), /due date/)
})

test('toggling a checkbox preserves frontmatter, fences and CRLF', () => {
  const text = '---\r\ntitle: Tasks\r\n---\r\n```md\r\n- [ ] Example\r\n```\r\n> - [X] Review proof\r\n'
  const tasks = scanTasks('Tasks.md', text)
  assert.deepEqual(tasks.map(({ label, line, checked }) => [label, line, checked]), [['Review proof', 6, true]])
  assert.equal(toggleTask(text, tasks[0]), text.replace('[X]', '[ ]'))
  assert.equal(toggleTask(text.replace('proof', 'print'), tasks[0]), undefined)
})

test('frontmatter only applies at the start of a note', () => {
  assert.equal(splitNote('First\n---\nSecond\n---\n').frontmatter, '')
  assert.deepEqual(splitNote('---\na: 1\n---\n\nHello'), { frontmatter: '---\na: 1\n---\n', body: '\nHello' })
})

test('task navigation addresses the chosen checkbox, even if its label is repeated', () => {
  const text = '---\r\ntitle: Notes\r\n---\r\nRepeat\r\n- [ ] Repeat\r\n- [ ] Repeat\r\n'
  const tasks = scanTasks('Notes.md', text)
  const hit = taskLocation(text, tasks[1])!
  assert.equal(hit.taskOrdinal, 1)
  assert.equal(text.slice(hit.from, hit.to), 'Repeat')
  assert.deepEqual(sourcePosition(text, hit.from), { lineNumber: 6, column: 7 })
})

test('links prefer a sibling and never choose between ambiguous short names', () => {
  const notes = ['one/Light.md', 'two/Light.md', 'three/Notes.md'].map((path) => ({ path, modifiedAt: 0 }))
  assert.equal(resolveNote('Light', 'one/Notes.md', notes), 'one/Light.md')
  assert.equal(resolveNote('../two/Light.md', 'one/Notes.md', notes), 'two/Light.md')
  assert.equal(resolveNote('Light', 'three/Notes.md', notes), undefined)
})

test('search prioritizes titles over body matches', () => {
  const notes = ['Studio.md', 'Light and color.md'].map((path) => ({ path, modifiedAt: 0 }))
  assert.deepEqual(searchNotes(notes, () => 'Indirect light after four.', 'light').map(({ path }) => path), ['Light and color.md', 'Studio.md'])
})

test('search produces the exact excerpt and source range for Unicode and literal punctuation', () => {
  const text = 'İntro 🌿\r\nTry [Идея] after lunch.'
  const [result] = searchNotes([{ path: 'Scratch.md', modifiedAt: 0 }], () => text, '[идея]')
  assert.deepEqual(result.excerpt, { before: 'Try ', match: '[Идея]', after: ' after lunch.' })
  assert.equal(text.slice(result.match!.from, result.match!.to), '[Идея]')
  assert.deepEqual(sourcePosition(text, result.match!.from), { lineNumber: 2, column: 5 })
  assert.deepEqual(findText(text, '[идея]'), result.match)
})

test('search does not drop notes beyond the first page', () => {
  const notes = Array.from({ length: 180 }, (_, index) => ({ path: `Note ${index}.md`, modifiedAt: 0 }))
  assert.equal(searchNotes(notes, () => undefined, '').length, 180)
  assert.equal(searchNotes(notes, () => 'Common phrase', 'phrase').length, 180)
})

test('reordering tabs does not duplicate or delete one', () => {
  assert.deepEqual(moveTab(['a', 'b', 'c'], 'a', 'c'), ['b', 'c', 'a'])
  assert.deepEqual(moveTab(['a', 'b', 'c'], 'c', 'b'), ['a', 'c', 'b'])
})
