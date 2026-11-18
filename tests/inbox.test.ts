import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appendCapture, asTask, captureTitle, inInbox, shortcutFrom, shortcutLabel } from '../src/lib/inbox.ts'
import { scanTasks } from '../src/lib/notes.ts'

test('a capture remains portable as a named Markdown file or a task with its original details', () => {
  assert.equal(captureTitle('\n# Try a smaller lens: Option / B'), 'Try a smaller lens Option B')
  assert.ok(inInbox('Inbox/Try a smaller lens.MD'))
  assert.equal(inInbox('Inbox/Archive/Old.md'), false)
  const task = asTask('Try the smaller lens\nBring the spare.')
  assert.equal(task, '- [ ] Try the smaller lens\n\nBring the spare.')
  assert.equal(scanTasks('Idea.md', task)[0].label, 'Try the smaller lens')
  assert.equal(asTask('   \n- [x] Try a smaller lens'), '- [ ] Try a smaller lens\n')
  assert.equal(appendCapture('Heading\r\n', 'Next'), 'Heading\r\n\r\nNext')
})

test('global shortcut uses the physical key and requires two modifiers', () => {
  const event = { code: 'KeyN', key: 'т', ctrlKey: true, shiftKey: true } as KeyboardEvent
  assert.equal(shortcutFrom(event), 'Control+Shift+N')
  assert.equal(shortcutLabel(shortcutFrom(event)!), '⌃⇧N')
  assert.equal(shortcutFrom({ ...event, shiftKey: false }), undefined)
})
