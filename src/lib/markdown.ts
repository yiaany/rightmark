import DOMPurify from 'dompurify'
import { Marked, type Tokens } from 'marked'
import { splitNote } from './notes.ts'

export const wikiPattern = /^\[\[([^\[\]\n|]+)(?:\|([^\]\n]+))?\]\]/
const underlineTag = /^<\/?u>$/i


function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
}

const markdown = new Marked({ gfm: true, async: false })
markdown.use({
  renderer: {
    html: ({ text }: Tokens.HTML | Tokens.Tag) => underlineTag.test(text) ? text : escapeHtml(text),
  },
  extensions: [{
    name: 'wikiLink',
    level: 'inline',
    start: (source) => source.indexOf('[['),
    tokenizer(source) {
      const match = wikiPattern.exec(source)
      if (match) return { type: 'wikiLink', raw: match[0], target: match[1], label: match[2] || match[1].split('/').at(-1) }
    },
    renderer(token) {
      return `<a href="#" data-wiki="${escapeHtml(token.target)}">${escapeHtml(token.label)}</a>`
    },
  }],
})

const surfaces = {
  ALLOWED_TAGS: ['a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img', 'input', 'li', 'ol', 'p', 'pre', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul'],
  ALLOWED_ATTR: ['align', 'alt', 'checked', 'class', 'data-wiki', 'disabled', 'href', 'src', 'start', 'title', 'type'],
  ALLOW_DATA_ATTR: false,
}

export function renderBody(body: string) {
  return DOMPurify.sanitize(markdown.parse(body, { async: false }), surfaces)
}

export function renderNote(text: string) { return renderBody(splitNote(text).body) }

export function noteLinks(text: string): string[] {
  const links = new Set<string>()
  markdown.walkTokens(markdown.lexer(splitNote(text).body), (token) => {
    if (token.type === 'wikiLink' && typeof token.target === 'string') links.add(token.target.trim())
    if (token.type !== 'link') return
    const { href } = token as Tokens.Link
    if (!/\.m(?:d|arkdown)(?:#|$)/i.test(href) || /^(?:[\w+.-]+:|\/\/)/.test(href)) return
    try { links.add(decodeURIComponent(href)) } catch { /* Invalid URL. */ }
  })
  return [...links]
}

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
