import { noteFolder } from './notes.ts'

function encodePath(value: string) {
  return value.split('/').map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/')
}

export function relativeMarkdown(from: string, to: string) {
  const a = noteFolder(from).split('/').filter(Boolean), b = to.split('/')
  while (a.length && b.length > 1 && a[0] === b[0]) { a.shift(); b.shift() }
  return (a.length ? '../'.repeat(a.length) : './') + encodePath(b.join('/'))
}

export function normalizeEditorLink(value: string, source?: { path: string; resolve: (target: string) => string | undefined }) {
  const input = value.trim()
  if (!input || /[\u0000-\u001f\u007f\\]/.test(input) || input.startsWith('//')) return
  if (!/^[a-z][a-z\d+.-]*:/i.test(input)) {
    if (input.startsWith('#')) return input === '#' ? undefined : input
    const [path, ...fragment] = input.split('#')
    let decoded = path
    try { decoded = decodeURIComponent(path) } catch { /* A literal percent sign can be part of a filename. */ }
    const note = source && (source.resolve(path) ?? (decoded !== path ? source.resolve(decoded) : undefined))
    const suffix = fragment.length ? `#${fragment.join('#').replace(/\s/g, '%20')}` : ''
    if (source && note && !note.includes('#')) return relativeMarkdown(source.path, note) + suffix
    if (/\.m(?:d|arkdown)$/i.test(decoded)) return encodePath(decoded) + suffix
  }
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`
  try {
    const url = new URL(candidate)
    if (url.protocol === 'mailto:') return url.pathname.includes('@') ? url.href : undefined
    if (['https:', 'http:'].includes(url.protocol) && url.hostname && !url.username && !url.password) return url.href
  } catch { /* Keep the form open on invalid input. */ }
}
