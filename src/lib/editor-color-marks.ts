import { Mark } from '@tiptap/core'
import { isEditorColor } from './editor-palette.ts'
import { colorMarkup, colorSpecs, readColorSpan } from './color-markdown.ts'

export const colorMarks = colorSpecs.map((spec) => Mark.create({
  name: spec.name,
  inclusive: false,
  addAttributes() { return { color: { default: null, rendered: false } } },
  parseHTML() {
    return [{ tag: `${spec.tag}[${spec.attr}]`, getAttrs: (element) => {
      const color = element.getAttribute(spec.attr)
      return isEditorColor(color) ? { color } : false
    } }]
  },
  renderHTML({ mark }) { return [spec.tag, { [spec.attr]: mark.attrs.color }, 0] },
  markdownTokenizer: {
    name: spec.name,
    level: 'inline',
    start: (source) => source.indexOf(`<${spec.tag} ${spec.attr}=`),
    tokenize(source, _tokens, lexer) {
      const span = readColorSpan(spec, source)
      if (span) return { type: spec.name, raw: span.raw, color: span.color, tokens: lexer.inlineTokens(span.inner) }
    },
  },
  parseMarkdown(token, helpers) {
    return helpers.applyMark(spec.name, helpers.parseInline(token.tokens ?? []), { color: token.color })
  },
  renderMarkdown(node, helpers) {
    const content = helpers.renderChildren(node)
    return isEditorColor(node.attrs?.color) ? colorMarkup(spec, node.attrs.color, content) : content
  },
}))
