import type { Node } from '@tiptap/pm/model'
import { findText, type SearchMatch } from './notes.ts'
import { localMarkdownTarget } from './markdown.ts'

export function currentMatch(text: string, match: SearchMatch) {
  return text.slice(match.from, match.to) === match.text ? match : (match.taskOrdinal === undefined && !match.exact) ? findText(text, match.text) : undefined
}

export function visualLink(doc: Node, link: NonNullable<SearchMatch['link']>) {
  let ordinal = 0, previousEnd = -1
  let found: SearchMatch | undefined
  doc.descendants((node, pos) => {
    if (found && found.to !== pos) return false
    const wiki = link.kind === 'wiki' && node.type.name === 'wikiLink' && node.attrs.target.trim() === link.target
    const mark = link.kind === 'markdown' && node.isInline && node.marks.find(({ type, attrs }) => type.name === 'link' && localMarkdownTarget(attrs.href) === link.target)
    if (!wiki && !mark) return !node.isInline
    const same = mark && previousEnd === pos
    if (!same && ordinal++ === link.ordinal) found = { from: pos, to: pos + node.nodeSize, text: node.textContent }
    else if (same && found?.to === pos) found.to = pos + node.nodeSize
    previousEnd = mark ? pos + node.nodeSize : -1
    return false
  })
  return found
}

export function visualMatch(doc: Node, text: string, taskOrdinal?: number): SearchMatch | undefined {
  let result: SearchMatch | undefined
  let target: number | undefined
  if (taskOrdinal !== undefined) {
    let ordinal = 0
    doc.descendants((node, pos) => {
      if (target === undefined && node.type.name === 'taskItem' && ordinal++ === taskOrdinal) target = pos
      return target === undefined
    })
    // The checkbox label is the item's first text block, not the same text in another item.
    if (target === undefined || doc.nodeAt(target)?.firstChild?.isTextblock !== true) return
  }
  doc.descendants((node, pos) => {
    if (result || !node.isTextblock) return !result
    if (target !== undefined && pos !== target + 1) return false
    let plain = ''
    node.forEach((child) => { plain += child.isText ? child.text : child.type.name === 'hardBreak' ? '\n' : '\uFFFC' })
    const match = findText(plain, text)
    if (match) result = { from: pos + 1 + match.from, to: pos + 1 + match.to, text: match.text }
    return false
  })
  return result
}
