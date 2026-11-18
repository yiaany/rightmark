import type { Editor } from '@tiptap/core'
import { Check, CodeXml, Minus, Quote, Table2 } from '@lucide/svelte'

type Chain = ReturnType<Editor['chain']>

export const blockCommands = [
  { label: 'Regular Text', group: 'Text', glyph: 'text', terms: 'paragraph plain', apply: (chain: Chain) => chain.setParagraph() },
  { label: 'Title', group: 'Text', glyph: 'title', terms: 'heading 1 h1', apply: (chain: Chain) => chain.setHeading({ level: 1 }) },
  { label: 'Heading', group: 'Text', glyph: 'heading', terms: 'heading 2 section h2', apply: (chain: Chain) => chain.setHeading({ level: 2 }) },
  { label: 'Subheading', group: 'Text', glyph: 'subheading', terms: 'heading 3 h3', apply: (chain: Chain) => chain.setHeading({ level: 3 }) },
  { label: 'Checkbox', group: 'List', icon: Check, badge: true, terms: 'task list todo checklist', apply: (chain: Chain) => chain.toggleTaskList() },
  { label: 'Bulleted list', group: 'List', glyph: 'bullet', terms: 'bullet list unordered bullets', apply: (chain: Chain) => chain.toggleBulletList() },
  { label: 'Numbered list', group: 'List', glyph: 'number', terms: 'ordered steps', apply: (chain: Chain) => chain.toggleOrderedList() },
  { label: 'Table', group: 'Blocks', icon: Table2, terms: 'grid columns rows', apply: (chain: Chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
  { label: 'Quote', group: 'Blocks', icon: Quote, terms: 'blockquote', apply: (chain: Chain) => chain.setBlockquote() },
  { label: 'Code block', group: 'Blocks', icon: CodeXml, terms: 'snippet fenced', apply: (chain: Chain) => chain.setCodeBlock() },
  { label: 'Divider', group: 'Blocks', icon: Minus, terms: 'horizontal rule separator', apply: (chain: Chain) => chain.setHorizontalRule() },
]
