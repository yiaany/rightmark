import DOMPurify from 'dompurify'
import { Marked, type Tokens } from 'marked'
import { noteName, splitNote, type SearchMatch } from './notes.ts'
import { colorMarkup, colorSpecs, isColorTag, readColorSpan } from './color-markdown.ts'
import { localImagePath } from './attachments.ts'

export const wikiPattern = /^\[\[([^\[\]\n|]+)(?:\|([^\]\n]+))?\]\]/
const underlineTag = /^<\/?u>$/i


function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
}

const markdown = new Marked({ gfm: true, async: false })
markdown.use({
  renderer: {
    html: ({ text }: Tokens.HTML | Tokens.Tag) => underlineTag.test(text) || isColorTag(text) ? text : escapeHtml(text),
    image({ href, text, title }) {
      if (!localImagePath(href)) return false
      return `<img data-local-image="${escapeHtml(href)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ''}>`
    },
  },
  extensions: [{
    name: 'wikiLink',
    level: 'inline',
    start: (source) => source.indexOf('[['),
    tokenizer(source) {
      const match = wikiPattern.exec(source)
      if (match) return { type: 'wikiLink', raw: match[0], target: match[1], label: match[2] || wikiLabel(match[1]) }
    },
    renderer(token) {
      return `<a href="#" data-wiki="${escapeHtml(token.target)}">${escapeHtml(token.label)}</a>`
    },
  }, ...colorSpecs.map((spec) => ({
    name: spec.name,
    level: 'inline' as const,
    start: (source: string) => source.indexOf(`<${spec.tag} ${spec.attr}=`),
    tokenizer(this: import('marked').TokenizerThis, source: string) {
      const span = readColorSpan(spec, source)
      if (span) return { type: spec.name, raw: span.raw, color: span.color, tokens: this.lexer.inlineTokens(span.inner) }
    },
    renderer(this: import('marked').RendererThis, token: Tokens.Generic) {
      return colorMarkup(spec, token.color, this.parser.parseInline(token.tokens ?? []))
    },
    childTokens: ['tokens'],
  }))],
})

export function wikiLabel(target: string) {
  const [path, anchor] = target.trim().split('#', 2)
  return path ? noteName(path) + (anchor ? `#${anchor}` : '') : anchor || target
}

const surfaces = {
  ALLOWED_TAGS: ['a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img', 'input', 'li', 'mark', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul'],
  ALLOWED_ATTR: ['align', 'alt', 'checked', 'class', 'data-folio-color', 'data-folio-highlight', 'data-wiki', 'data-local-image', 'disabled', 'href', 'src', 'start', 'title', 'type'],
  ALLOW_DATA_ATTR: false,
}

export function renderBody(body: string) {
  return DOMPurify.sanitize(markdown.parse(body, { async: false }), surfaces)
}

export function renderNote(text: string) { return renderBody(splitNote(text).body) }

export function localMarkdownTarget(href: string) {
  if (!href || /^(?:[\w+.-]+:|\/\/)/.test(href)) return
  const hash = href.indexOf('#'), path = hash < 0 ? href : href.slice(0, hash)
  try {
    const decoded = decodeURIComponent(path)
    if (decoded.startsWith('//') || /[?#:\\\u0000-\u001f\u007f]/.test(decoded)) return
    // Markdown links can use a note name without an extension as well as a file path.
    return decoded + (hash < 0 ? '' : href.slice(hash))
  } catch { /* Invalid URL. */ }
}

export type NoteReference = {
  target: string; kind: 'wiki' | 'markdown'; match: SearchMatch; context: string; label: string
  excerpt: { before: string; after: string }
  replacement: (target: string) => string
}

// Marked decides what is actually a link. Map its raw tokens back to the source,
// accounting for CRLF and prefixes stripped from nested lists and blockquotes.
type Heading = { title: string; depth: number; line: number; from: number; ordinal: number }
type ImageReference = { from: number; to: number; href: string; replacement: (href: string) => string }

function scanMarkdown(text: string, kind: 'links' | 'headings' | 'images') {
  const { body, frontmatter } = splitNote(text)
  const normalized = body.replace(/\r\n?/g, '\n')
  const carriageReturns: number[] = []
  for (const match of body.matchAll(/\r\n/g)) carriageReturns.push(match.index - carriageReturns.length)
  function original(pos: number) {
    let lo = 0, hi = carriageReturns.length
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (carriageReturns[mid] < pos) lo = mid + 1; else hi = mid }
    return frontmatter.length + pos + lo
  }
  const references: NoteReference[] = []
  const headings: Heading[] = []
  const images: ImageReference[] = []
  let ordinal = 0
  function visit(tokens: Tokens.Generic[], source: string, at: (pos: number) => number | undefined) {
    let cursor = 0
    for (const token of tokens) {
      const raw = token.raw as string
      if (typeof raw !== 'string') continue
      let start = source.indexOf(raw, cursor)
      let offsets: number[] | undefined
      if (start < 0 && raw.includes('\n')) {
        const lines = raw.split('\n')
        const first = source.indexOf(lines[0], cursor)
        if (lines[0] && first >= 0) {
          let position = first, valid = true
          const mapped: number[] = []
          for (const [index, line] of lines.entries()) {
            const eol = source.indexOf('\n', position)
            const end = eol < 0 ? source.length : eol
            const found = line ? source.indexOf(line, position) : end
            if (found < 0 || found + line.length > end || (index < lines.length - 1 && eol < 0)) { valid = false; break }
            for (let n = 0; n < line.length; n++) mapped.push(found + n)
            if (index < lines.length - 1) mapped.push(end)
            else mapped.push(found + line.length)
            position = eol + 1
          }
          if (valid) { start = first; offsets = mapped }
        }
      }
      if (start < 0) continue
      cursor = offsets?.at(-1) ?? start + raw.length
      const locate = (pos: number) => at(offsets ? offsets[pos] : start + pos)
      if (kind === 'headings' && token.type === 'heading') {
        const number = ordinal++
        const pos = locate(0)
        if (pos !== undefined) {
          const from = original(pos)
          const title = (token.tokens as Tokens.Generic[] | undefined)?.map((part) => part.label ?? part.text ?? part.raw).join('').trim() || token.text || 'Untitled heading'
          headings.push({ title, depth: token.depth, line: text.slice(0, from).split('\n').length, from, ordinal: number })
        }
      }
      if (kind === 'images' && token.type === 'image') {
        const a = locate(0), b = locate(raw.length - 1)
        if (a !== undefined && b !== undefined) {
          const from = original(a), to = original(b + 1)
          const actual = text.slice(from, to)
          images.push({ from, to, href: token.href, replacement: (href) => {
            const dest = /^(.*?\]\(\s*)(<[^>]+>|[^\s)]+)([\s\S]*)$/.exec(actual)
            if (dest && dest[2].replace(/^<|>$/g, '') === token.href) return `${dest[1]}${href}${dest[3]}`
            return `![${String(token.text).replace(/[\\\[\]]/g, '\\$&')}](${href}${token.title ? ` "${String(token.title).replace(/["\\]/g, '\\$&')}"` : ''})`
          } })
        }
      }
      const wiki = token.type === 'wikiLink' ? wikiPattern.exec(raw) : null
      const link = token.type === 'link' ? token as Tokens.Link : undefined
      const target = wiki?.[1].trim() ?? (link && localMarkdownTarget(link.href))
      if (kind === 'links' && target && (wiki || link)) {
        const a = locate(0), b = locate(raw.length - 1)
        if (a === undefined || b === undefined) continue
        const from = original(a), to = original(b + 1)
        const actual = text.slice(from, to)
        const lineStart = text.lastIndexOf('\n', from - 1) + 1
        const lineEnd = text.indexOf('\n', to)
        const before = text.slice(Math.max(lineStart, from - 84), from)
        const end = lineEnd < 0 ? text.length : lineEnd
        const after = text.slice(to, Math.min(end, to + 96))
        const excerpt = { before: (from - 84 > lineStart ? '…' : '') + before.trimStart(), after: after.trimEnd() + (to + 96 < end ? '…' : '') }
        const context = excerpt.before + actual + excerpt.after
        const replacement = (value: string) => {
          if (wiki) return `[[${value}${wiki[2] === undefined ? '' : `|${wiki[2]}`}]]`
          // Preserve the source label and the exact title/spacing of inline links.
          const label = /^\[((?:\\[\s\S]|[^\[\]]|\[(?:\\[\s\S]|[^\[\]])*\])*)\]/.exec(actual)
          const head = label?.[0] ?? `[${link!.text.replace(/[\[\]]/g, '\\$&')}]`
          const tail = label && actual.slice(head.length)
          const destination = tail && /^\([\s]*?(<[^>\n]*>|(?:\\.|[^\s()])+)/.exec(tail)
          const afterHref = destination && destination[1].replace(/^<|>$/g, '') === link!.href ? tail.slice(destination[0].length) : undefined
          const prefix = afterHref !== undefined && destination ? destination[0].slice(0, -destination[1].length) : '('
          const suffix = afterHref ?? `${link!.title ? ` "${link!.title.replace(/["\\]/g, '\\$&')}"` : ''})`
          return `${head}${prefix}${value}${suffix}`
        }
        const label = wiki ? wiki[2] || wikiLabel(wiki[1]) : link!.text
        references.push({ target, kind: wiki ? 'wiki' : 'markdown', match: { from, to, text: actual, exact: true }, excerpt, context, label, replacement })
      } else if (!['image', 'link', 'html', 'code', 'codespan'].includes(token.type)) {
        if (token.type === 'table') {
          const table = token as Tokens.Table
          visit([...table.header, ...table.rows.flat()].map((cell) => ({ ...cell, raw: cell.text, type: 'tableCell' })), raw, locate)
        } else {
          const children = token.type === 'list' ? token.items : token.tokens
          if (children?.length) visit(children, raw, locate)
        }
      }
    }
  }
  visit(markdown.lexer(normalized), normalized, (pos) => pos)
  return { references, headings, images }
}

export const noteReferences = (text: string) => scanMarkdown(text, 'links').references
export const noteHeadings = (text: string) => scanMarkdown(text, 'headings').headings
export const noteImages = (text: string) => scanMarkdown(text, 'images').images

export function noteLinks(text: string): string[] { return [...new Set(noteReferences(text).map(({ target }) => target))] }

export function hoverExcerpt(text: string) {
  const body = splitNote(text).body.replace(/^# [^\n]*(?:\r?\n|$)/, '').trim()
  return renderBody(body.slice(0, 950))
}

export function visualInputBlockReason(body: string) {
  if (body.length > 250_000) return 'This file is too large for visual editing.'
  let containsHtml = false
  markdown.walkTokens(markdown.lexer(body), (token) => { if (token.type === 'html' && !underlineTag.test(token.raw)) containsHtml = true })
  if (containsHtml || /^\s*\[\^[^\]]+\]:|!\[\[|^\s*%%/m.test(body)) return 'This note uses syntax that is best edited in Markdown.'
  return ''
}

export function visualBlockReason(body: string, serialized: string) {
  if (renderBody(body).trim() !== renderBody(serialized).trim()) return 'Open Editor to preserve this note’s original Markdown.'
  return ''
}
