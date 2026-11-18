import type { Node } from '@tiptap/pm/model'
import { Selection, TextSelection, type EditorState } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'

export type MovableBlock = { parent: Node; base: number; index: number; from: number; node: Node }

export function blockAt(doc: Node, position: number): MovableBlock | undefined {
  const $pos = doc.resolve(position)
  let depth = 1
  for (let d = $pos.depth; d >= 2; d--) {
    if (['listItem', 'taskItem'].includes($pos.node(d).type.name)) { depth = d; break }
  }
  if ($pos.depth < depth) return undefined
  const parent = $pos.node(depth - 1)
  const index = $pos.index(depth - 1)
  if (parent.childCount < 2) return undefined
  return { parent, base: $pos.start(depth - 1), index, from: $pos.before(depth), node: $pos.node(depth) }
}

export function blockBoundary(block: MovableBlock, index: number) {
  let offset = block.base
  for (let i = 0; i < index; i++) offset += block.parent.child(i).nodeSize
  return offset
}

// A boundary is a slot between siblings, not a position inside another block.
export function moveBlock(state: EditorState, block: MovableBlock, boundary: number) {
  if (!Number.isInteger(boundary) || boundary < 0 || boundary > block.parent.childCount || boundary === block.index || boundary === block.index + 1) return
  if (state.doc.nodeAt(block.from) !== block.node) return
  const target = blockBoundary(block, boundary)
  const end = block.from + block.node.nodeSize
  const tr = closeHistory(state.tr).delete(block.from, end)
  const to = tr.mapping.map(target)
  tr.insert(to, block.node)
  const { selection } = state
  if (selection instanceof TextSelection && selection.from > block.from && selection.to < end) {
    tr.setSelection(TextSelection.create(tr.doc, to + selection.anchor - block.from, to + selection.head - block.from))
  } else {
    tr.setSelection(Selection.near(tr.doc.resolve(to + 1)))
  }
  return tr.scrollIntoView()
}
