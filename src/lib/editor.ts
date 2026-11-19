import { inputRules, smartInputRules } from './editor-input.ts'
import { Editor, Node } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table/kit'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { wikiLabel, wikiPattern, visualBlockReason, visualInputBlockReason } from './markdown.ts'
import { splitNote } from './notes.ts'
import { smoothCaret } from './smooth-caret.ts'
import { blockDrag } from './block-drag.ts'
import { colorMarks } from './editor-color-marks.ts'
import { editorSearch } from './editor-search.ts'
import { hydrateImages, localImagePath } from './attachments.ts'

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
    return ['a', { href: '#', 'data-wiki': node.attrs.target, contenteditable: 'false', draggable: 'false' }, node.attrs.label || wikiLabel(node.attrs.target)]
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

export function createVisualEditor(element: HTMLElement, text: string, onChange: (text: string) => void, onSelection: () => void, images?: { path: string; read: (path: string) => Promise<ArrayBuffer> }) {
  const { body, frontmatter } = splitNote(text)
  const inputReason = visualInputBlockReason(body)
  let pending: ReturnType<typeof setTimeout> | undefined
  const editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, enableClickSelection: false, HTMLAttributes: { draggable: 'false' } },
      }),
      Markdown,
      ...colorMarks,
      WikiLink,
      TaskList,
      TaskItem.configure({ nested: true }),
      images ? Image.extend({
        addNodeView() {
          return ({ node }) => {
            const dom = document.createElement('img')
            dom.draggable = false
            if (localImagePath(node.attrs.src)) dom.dataset.localImage = node.attrs.src
            else if (/^https?:\/\//i.test(node.attrs.src)) dom.src = node.attrs.src
            dom.alt = node.attrs.alt ?? ''
            if (node.attrs.title) dom.title = node.attrs.title
            const destroy = hydrateImages(dom, images.path, images.read)
            return { dom, destroy, ignoreMutation: () => true }
          }
        },
      }) : Image,
      TableKit,
      Placeholder.configure({ placeholder: 'Type / for commands' }),
      smartInputRules,
      smoothCaret,
      blockDrag,
      editorSearch,
    ],
    enablePasteRules: false,
    enableInputRules: inputRules,
    content: inputReason ? '' : body,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        'aria-label': 'Write note', role: 'textbox', 'aria-multiline': 'true',
        spellcheck: String(document.documentElement.dataset.editorSpellcheck === 'on'), autocorrect: 'off', autocapitalize: 'off', autocomplete: 'off',
      },
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
      pending = setTimeout(flush, 35)
    },
    onTransaction: onSelection,
  })
  const reason = inputReason || visualBlockReason(body, editor.getMarkdown())
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
