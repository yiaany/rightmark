import { inputRules, smartInputRules } from './editor-input.ts'
import { Editor, Node } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table/kit'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { wikiPattern, visualBlockReason } from './markdown.ts'
import { splitNote } from './notes.ts'
import { smoothCaret } from './smooth-caret.ts'

const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { target: { default: '', rendered: false }, label: { default: '', rendered: false } }
  },
  parseHTML() { return [] },
  renderHTML({ node }) {
    return ['a', { href: '#', 'data-wiki': node.attrs.target, contenteditable: 'false' }, node.attrs.label || node.attrs.target.split('/').at(-1)]
  },
  markdownTokenizer: {
    name: 'wikiLink',
    level: 'inline',
    start: (src) => src.indexOf('[['),
    tokenize(src) {
      const match = wikiPattern.exec(src)
      return match ? { type: 'wikiLink', raw: match[0], target: match[1], label: match[2] || '' } : undefined
    },
  },
  parseMarkdown: (token, helpers) => helpers.createNode('wikiLink', { target: token.target, label: token.label }),
  renderMarkdown: (node) => `[[${node.attrs?.target}${node.attrs?.label ? `|${node.attrs.label}` : ''}]]`,
})

export function createVisualEditor(element: HTMLElement, text: string, onChange: (text: string) => void, onSelection: () => void) {
  const { body, frontmatter } = splitNote(text)
  let pending: ReturnType<typeof setTimeout> | undefined
  const editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({
        underline: false,
        link: { openOnClick: false, enableClickSelection: false },
      }),
      Markdown,
      WikiLink,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      TableKit,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      smartInputRules,
      smoothCaret,
    ],
    enablePasteRules: false,
    enableInputRules: inputRules,
    content: body.length > 250_000 || /<[a-z!/]/i.test(body) ? '' : body,
    contentType: 'markdown',
    editorProps: {
      attributes: { 'aria-label': 'Write note', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'true' },
      // Markdown is the storage format. Do not admit HTML that has no Markdown form.
      clipboardTextParser: (content, _context, _plain, view) => {
        const lines = content.replace(/\r\n/g, '\n').split('\n')
        const doc = view.state.schema.topNodeType.create(null, lines.map((line) => view.state.schema.nodes.paragraph.create(null, line ? view.state.schema.text(line) : undefined)))
        return doc.slice(0, doc.content.size, false)
      },
      transformPastedHTML: () => '',
    },
    onUpdate: ({ editor }) => {
      if (!editor.isEditable) return
      clearTimeout(pending)
      pending = setTimeout(flush, 90)
    },
    onTransaction: onSelection,
  })
  const reason = visualBlockReason(body, editor.getMarkdown())
  if (reason) editor.setEditable(false, false)
  function flush() {
    if (!pending) return
    clearTimeout(pending)
    pending = undefined
    const serialized = editor.getMarkdown().trimEnd()
    let next = serialized ? serialized + '\n' : ''
    if (text.includes('\r\n')) next = next.replace(/\n/g, '\r\n')
    onChange(frontmatter + next)
  }
  return { editor, reason, flush }
}
