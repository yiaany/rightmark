export type Note = { path: string; modifiedAt: number }
export type Task = { path: string; line: number; label: string; checked: boolean }

export const noteName = (path: string) => (path.split('/').at(-1) ?? path).replace(/\.(md|markdown)$/i, '')
export const noteFolder = (path: string) => path.split('/').slice(0, -1).join('/')

export function splitNote(text: string) {
  const header = /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?^\s*?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m.exec(text)
  const frontmatter = header?.index === 0 ? header[0] : text.startsWith('\uFEFF') ? '\uFEFF' : ''
  return { frontmatter, body: text.slice(frontmatter.length) }
}

const checkbox = /^( {0,3}(?:(?: {0,3}>[ \t]?)+)?[ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+)\[([ xX])\](?=[ \t]|$)/

export function scanTasks(path: string, text: string): Task[] {
  const { frontmatter, body } = splitNote(text)
  const offset = frontmatter.split('\n').length - 1
  const tasks: Task[] = []
  let fence: string | undefined
  let inComment = false
  for (const [index, line] of body.split(/\r?\n/).entries()) {
    if (inComment || (!fence && line.trimStart().startsWith('<!--'))) {
      inComment = !line.includes('-->')
      continue
    }
    const marker = /^[ \t]*(?:>[ \t]*)*(`{3,}|~{3,})(.*)$/.exec(line)
    if (marker && (!fence || (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()))) {
      fence = fence ? undefined : marker[1]
      continue
    }
    if (fence) continue
    const match = checkbox.exec(line)
    const label = match && line.slice(match[0].length).trim()
    if (match && label) tasks.push({ path, line: index + offset, label, checked: match[2] !== ' ' })
  }
  return tasks
}

export function toggleTask(text: string, task: Task): string | undefined {
  // Keep the rest of the file byte-for-byte, including the line endings.
  const current = scanTasks(task.path, text).find((item) => item.line === task.line)
  if (!current || current.label !== task.label || current.checked !== task.checked) return
  const lines = text.split(/(\r?\n)/)
  lines[task.line * 2] = lines[task.line * 2].replace(checkbox, (_, prefix: string) => `${prefix}[${task.checked ? ' ' : 'x'}]`)
  return lines.join('')
}

export function resolveNote(target: string, from: string, notes: Note[]): string | undefined {
  const path = target.split('#')[0].trim()
  if (!path) return from
  const canonical = (value: string) => value.normalize('NFC').toLocaleLowerCase().replace(/\.(md|markdown)$/i, '')
  const requested = canonical(path)
  const relative = [noteFolder(from), path].filter(Boolean).join('/').split('/').reduce<string[]>((parts, part) => {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
    return parts
  }, []).join('/')
  const exact = notes.find((note) => canonical(note.path) === canonical(relative)) ??
    notes.find((note) => canonical(note.path) === requested)
  if (exact) return exact.path
  const matches = notes.filter((note) => canonical(noteName(note.path)) === requested)
  return matches.length === 1 ? matches[0].path : undefined
}

export type SearchMatch = { from: number; to: number; text: string }
type SearchExcerpt = { before: string; match: string; after: string }
export type SearchResult = Note & { rank: number; excerpt?: SearchExcerpt; match?: SearchMatch }

function literal(value: string) { return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu') }

export function findText(text: string, value: string, start = 0): SearchMatch | undefined {
  if (!value) return
  const hit = literal(value).exec(text.slice(start))
  if (hit) return { from: start + hit.index, to: start + hit.index + hit[0].length, text: hit[0] }
}

export function sourcePosition(text: string, offset: number) {
  const before = text.slice(0, offset)
  return { lineNumber: before.split(/\r\n?|\n/).length, column: offset - Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r')) }
}

export function searchNotes(notes: Note[], textFor: (path: string) => string | undefined, query: string): SearchResult[] {
  const value = query.trim()
  if (!value) return notes.map((note) => ({ ...note, rank: 0 }))
  const pattern = literal(value)
  return notes.flatMap((note) => {
    const title = noteName(note.path)
    const body = textFor(note.path) ?? ''
    const titleHit = title.search(pattern)
    const rank = titleHit === 0 ? 0 : titleHit > 0 ? 1 : pattern.test(note.path) ? 2 : 3
    const hit = pattern.exec(body)
    if (!hit) return rank === 3 ? [] : [{ ...note, rank }]
    const from = hit.index, to = from + hit[0].length
    const lineStart = body.lastIndexOf('\n', from - 1) + 1
    const lineEnd = body.indexOf('\n', to)
    const end = lineEnd < 0 ? body.length : lineEnd
    const start = Math.max(lineStart, from - 46), stop = Math.min(end, to + 52)
    return [{ ...note, rank, match: { from, to, text: hit[0] }, excerpt: {
      before: (start > lineStart ? '…' : '') + body.slice(start, from).trimStart(),
      match: hit[0],
      after: body.slice(to, stop).trimEnd() + (stop < end ? '…' : ''),
    } }]
  }).sort((a, b) => a.rank - b.rank)
}

export function moveTab(paths: string[], from: string, to: string) {
  if (from === to || !paths.includes(from) || !paths.includes(to)) return paths
  const next = paths.filter((path) => path !== from)
  next.splice(paths.indexOf(to), 0, from)
  return next
}
