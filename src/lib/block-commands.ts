import type { Editor } from '@tiptap/core'
import { Check, CodeXml, Heading1, Heading2, Heading3, List, ListOrdered, Minus, Pilcrow, Quote, Table2 } from '@lucide/svelte'

type Chain = ReturnType<Editor['chain']>

export const blockCommands = [
  { label: 'Text', group: 'Text', icon: Pilcrow, terms: 'paragraph plain', apply: (chain: Chain) => chain.setParagraph() },
  { label: 'Heading 1', group: 'Text', icon: Heading1, terms: 'title h1', apply: (chain: Chain) => chain.setHeading({ level: 1 }) },
  { label: 'Heading 2', group: 'Text', icon: Heading2, terms: 'section h2', apply: (chain: Chain) => chain.setHeading({ level: 2 }) },
  { label: 'Heading 3', group: 'Text', icon: Heading3, terms: 'subheading h3', apply: (chain: Chain) => chain.setHeading({ level: 3 }) },
  { label: 'Bullet list', group: 'Lists', icon: List, terms: 'unordered bullets', apply: (chain: Chain) => chain.toggleBulletList() },
  { label: 'Numbered list', group: 'Lists', icon: ListOrdered, terms: 'ordered steps', apply: (chain: Chain) => chain.toggleOrderedList() },
  { label: 'Task list', group: 'Lists', icon: Check, terms: 'checkbox todo checklist', apply: (chain: Chain) => chain.toggleTaskList() },
  { label: 'Table', group: 'Blocks', icon: Table2, terms: 'grid columns rows', apply: (chain: Chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
  { label: 'Quote', group: 'Blocks', icon: Quote, terms: 'blockquote', apply: (chain: Chain) => chain.setBlockquote() },
  { label: 'Code block', group: 'Blocks', icon: CodeXml, terms: 'snippet fenced', apply: (chain: Chain) => chain.setCodeBlock() },
  { label: 'Divider', group: 'Blocks', icon: Minus, terms: 'horizontal rule separator', apply: (chain: Chain) => chain.setHorizontalRule() },
]
