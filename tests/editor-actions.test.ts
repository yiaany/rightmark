import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { Schema } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { history, undo } from '@tiptap/pm/history'
import { blockAt, moveBlock } from '../src/lib/block-move.ts'
import { normalizeEditorLink } from '../src/lib/editor-link.ts'
import { visualInputBlockReason } from '../src/lib/markdown.ts'

const schema = new Schema({ nodes: {
  doc: { content: 'block+' },
  paragraph: { content: 'text*', group: 'block' },
  bulletList: { content: 'listItem+', group: 'block' },
  listItem: { content: 'paragraph' },
  text: {},
} })
const para = (value: string) => schema.node('paragraph', null, schema.text(value))

test('moving a block preserves its selection and is undoable in one step', () => {
  const doc = schema.node('doc', null, [para('First'), para('Second'), para('Third')])
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, 2, 5), plugins: [history()] })
  const block = blockAt(doc, state.selection.head)!
  assert.equal(moveBlock(state, block, 1), undefined)
  const changed = state.apply(moveBlock(state, block, 3)!)
  assert.equal(changed.doc.textBetween(0, changed.doc.content.size, '/'), 'Second/Third/First')
  assert.equal(changed.doc.textBetween(changed.selection.from, changed.selection.to), 'irs')
  assert.equal(undo(changed, (tr) => assert.ok(changed.apply(tr).doc.eq(doc))), true)
})

test('list items reorder without flattening their list', () => {
  const list = schema.node('bulletList', null, ['A', 'B', 'C'].map((value) => schema.node('listItem', null, para(value))))
  const doc = schema.node('doc', null, list)
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) })
  const block = blockAt(doc, 3)!
  assert.equal(block.node.type.name, 'listItem')
  const moved = state.apply(moveBlock(state, block, 2)!)
  assert.equal(moved.doc.firstChild?.type.name, 'bulletList')
  assert.equal(moved.doc.firstChild?.textContent, 'BAC')
})

test('link entry supports websites, email, and local Markdown without allowing other schemes', () => {
  assert.equal(normalizeEditorLink('example.com'), 'https://example.com/')
  assert.equal(normalizeEditorLink('mailto:writer@example.com'), 'mailto:writer@example.com')
  assert.equal(normalizeEditorLink('../Field notes.md#Draft'), '../Field%20notes.md#Draft')
  assert.equal(normalizeEditorLink('file:///tmp/note.md'), undefined)
  assert.equal(normalizeEditorLink('https://user:pass@example.com'), undefined)
})

test('plain underline markup is editable without admitting arbitrary HTML', () => {
  assert.equal(visualInputBlockReason('Keep <u>this</u> and `<div>` in visual mode.'), '')
  assert.notEqual(visualInputBlockReason('<u class="foo">Other HTML stays in source</u>'), '')
})
