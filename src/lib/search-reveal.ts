import type { Node } from '@tiptap/pm/model'
import { findText, type SearchMatch } from './notes.ts'

export function currentMatch(text: string, match: SearchMatch) {
  return text.slice(match.from, match.to) === match.text ? match : findText(text, match.text)
}

export function visualMatch(doc: Node, text: string): SearchMatch | undefined {
  let result: SearchMatch | undefined
  doc.descendants((node, pos) => {
    if (result || !node.isTextblock) return !result
    let plain = ''
    node.forEach((child) => { plain += child.isText ? child.text : child.type.name === 'hardBreak' ? '\n' : '\uFFFC' })
    const match = findText(plain, text)
    if (match) result = { from: pos + 1 + match.from, to: pos + 1 + match.to, text: match.text }
    return false
  })
  return result
}
