import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { moveTab, resolveNote, scanTasks, searchNotes, splitNote, toggleTask } from '../src/lib/notes.ts'

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

test('reordering tabs does not duplicate or delete one', () => {
  assert.deepEqual(moveTab(['a', 'b', 'c'], 'a', 'c'), ['b', 'c', 'a'])
  assert.deepEqual(moveTab(['a', 'b', 'c'], 'c', 'b'), ['a', 'c', 'b'])
})
