import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { imageFormat, markdownImage, relativeWorkspacePath, workspaceImage } from '../src/lib/attachments.ts'
import { noteHeadings, noteImages } from '../src/lib/markdown.ts'
import { rewriteMove } from '../src/lib/note-actions.ts'
import { parseSession } from '../src/lib/session-state.ts'

test('outline gives distinct positions to repeated headings and ignores fences and frontmatter', () => {
  const text = '---\r\ntitle: Test\r\n---\r\n# Repeat\r\n\r\n```md\r\n# a code sample\r\n```\r\n\r\n## **Repeat**\r\n\r\nLast heading\r\n============\r\n'
  assert.deepEqual(noteHeadings(text).map(({ title, depth, line, ordinal }) => [title, depth, line, ordinal]), [['Repeat', 1, 4, 0], ['Repeat', 2, 10, 1], ['Last heading', 1, 12, 2]])
})

test('relative attachment paths stay portable and cannot escape the workspace', () => {
  assert.equal(workspaceImage('../Attachments/a%20b.png', 'Notes/Day.md'), 'Attachments/a b.png')
  assert.equal(workspaceImage('../../Elsewhere.png', 'Notes/Day.md'), undefined)
  assert.equal(workspaceImage('%2F%2Fexample.com/pic.png', 'Notes/Day.md'), undefined)
  assert.equal(workspaceImage('file:///tmp/img.png', 'Notes/Day.md'), undefined)
  assert.equal(workspaceImage('../.hidden/a.png', 'Notes/Day.md'), undefined)
  assert.equal(relativeWorkspacePath('Notes/Day.md', 'Notes/my (pic).png'), 'my%20%28pic%29.png')
  assert.equal(markdownImage({ src: 'Attachments/a.png', alt: 'Photo [new]' }), '![Photo \\[new\\]](Attachments/a.png)')
  assert.equal(imageFormat(Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)), 'png')
  assert.equal(imageFormat(new TextEncoder().encode('<svg/>')), undefined)
})

test('moving a note rebases image links without rewriting external images or code', () => {
  const text = '![Studio](../Attachments/pic.png "Photo")\r\n\r\n![Online](https://example.com/pic.png)\r\n\r\n`![code](../Attachments/pic.png)`\r\n'
  assert.equal(noteImages(text).length, 2)
  assert.deepEqual(rewriteMove([{ path: 'Notes/Day.md', text }], 'Notes/Day.md', 'Archive/2026/Day.md'), [{ path: 'Notes/Day.md', text: text.replace('../Attachments/pic.png', '../../Attachments/pic.png') }])
})

test('restore state tolerates stale and malformed view fields', () => {
  const saved = parseSession(JSON.stringify({ tabs: ['a.md', false, 'a.md', 'b.md'], active: 'b.md', page: 'note', views: {
    'a.md': { mode: 'split', scrollTop: 190, richState: { from: 1, to: 1 } }, 'b.md': { mode: 'unknown', scrollTop: -1 },
  } }))!
  assert.deepEqual(saved.tabs, ['a.md', 'b.md'])
  assert.equal(saved.active, 'b.md')
  assert.equal(saved.views['a.md'].scrollTop, 190)
  assert.equal(saved.views['b.md'].mode, undefined)
  assert.equal(parseSession('{bad'), undefined)
})
