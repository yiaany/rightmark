export type Note = { path: string; modifiedAt: number }
export type Task = { path: string; line: number; label: string; checked: boolean; due?: string; sourceLabel?: string }

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
    const sourceLabel = match && line.slice(match[0].length).trim()
    if (!match || !sourceLabel) continue
    const date = /[ \t]+(?:📅[ \t]*|due:)(\d{4}-\d{2}-\d{2})$/u.exec(sourceLabel)
    const due = date && validDate(date[1]) ? date[1] : undefined
    tasks.push({ path, line: index + offset, label: due ? sourceLabel.slice(0, date!.index) : sourceLabel, checked: match[2] !== ' ', ...(due ? { due, sourceLabel } : {}) })
  }
  return tasks
}

export function toggleTask(text: string, task: Task): string | undefined {
  // Keep the rest of the file byte-for-byte, including the line endings.
  const current = scanTasks(task.path, text).find((item) => item.line === task.line)
  if (!current || current.label !== task.label || current.due !== task.due || current.checked !== task.checked) return
  const lines = text.split(/(\r?\n)/)
  lines[task.line * 2] = lines[task.line * 2].replace(checkbox, (_, prefix: string) => `${prefix}[${task.checked ? ' ' : 'x'}]`)
  return lines.join('')
}

export function setTaskDue(text: string, task: Task, date: string): string | undefined {
  if (date && !validDate(date)) return
  const current = scanTasks(task.path, text).find((item) => item.line === task.line)
  if (!current || current.label !== task.label || current.due !== task.due || current.checked !== task.checked) return
  if (date === (current.due ?? '')) return text
  const lines = text.split(/(\r?\n)/), line = lines[task.line * 2]
  const end = line.trimEnd().length
  const marker = current.due ? /[ \t]+(?:📅[ \t]*|due:)\d{4}-\d{2}-\d{2}$/u.exec(line.slice(0, end)) : undefined
  lines[task.line * 2] = line.slice(0, marker?.index ?? end) + (date ? ` 📅 ${date}` : '') + line.slice(end)
  return lines.join('')
}

export function appendTask(text: string, title: string, due = '') {
  const label = title.trim()
  if (!label || /[\r\n]/.test(label)) throw new Error('Enter a task on one line.')
  if (due && !validDate(due)) throw new Error('Enter a valid due date.')
  const { body } = splitNote(text)
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const separator = (!body && (!text || text === '\uFEFF')) || text.endsWith(newline.repeat(2)) ? '' : text.endsWith(newline) ? newline : newline.repeat(2)
  const prefix = text + separator
  const next = `${prefix}- [ ] ${label}${due ? ` 📅 ${due}` : ''}${newline}`
  if (!scanTasks('', next).some((task) => task.line === sourcePosition(prefix, prefix.length).lineNumber - 1)) {
    throw new Error('Close the unfinished code block or comment before adding a task to this note.')
  }
  return next
}

export function localDate(date = new Date()) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value
}

export const taskTiming = (task: Task, today: string) => !task.checked && task.due ? task.due < today ? 'Overdue' : task.due === today ? 'Today' : undefined : undefined

export const pathKey = (value: string) => value.normalize('NFC').toLowerCase()
const stemKey = (value: string) => pathKey(value).replace(/\.(md|markdown)$/i, '')

export function noteResolver(notes: Note[]) {
  const direct = new Map<string, string | null>(), stems = new Map<string, string | null>(), names = new Map<string, string | null>()
  function add(map: Map<string, string | null>, key: string, path: string) { map.set(key, map.has(key) ? null : path) }
  for (const { path } of notes) {
    add(direct, pathKey(path), path)
    add(stems, stemKey(path), path)
    add(names, pathKey(noteName(path)), path)
  }
  function exact(path: string) {
    return /\.(md|markdown)$/i.test(path) ? direct.get(pathKey(path)) : stems.get(stemKey(path))
  }
  return (target: string, from: string): string | undefined => {
    const path = target.split('#')[0].trim()
    if (!path) return from
    if (path.startsWith('/')) return exact(path.slice(1)) ?? undefined
    const parts = noteFolder(from).split('/').filter(Boolean)
    for (const part of path.split('/')) {
      if (part === '..') { if (!parts.length) return; parts.pop() }
      else if (part && part !== '.') parts.push(part)
    }
    const local = exact(parts.join('/'))
    if (local !== undefined || /^\.{1,2}(?:\/|$)/.test(path)) return local ?? undefined
    const rooted = exact(path)
    if (rooted !== undefined) return rooted ?? undefined
    const named = names.get(stemKey(path))
    return named && (!/\.(md|markdown)$/i.test(path) || pathKey(named).endsWith(pathKey(path))) ? named : undefined
  }
}

export function resolveNote(target: string, from: string, notes: Note[]) { return noteResolver(notes)(target, from) }

export type SearchMatch = { from: number; to: number; text: string; taskOrdinal?: number; exact?: boolean; link?: { kind: 'wiki' | 'markdown'; target: string; ordinal: number } }

export function taskLocation(text: string, task: Task): SearchMatch | undefined {
  const tasks = scanTasks(task.path, text)
  const taskOrdinal = tasks.findIndex(({ line, label, due }) => line === task.line && label === task.label && due === task.due)
  if (taskOrdinal < 0) return
  let start = 0
  for (let index = 0; index < task.line; index++) start = text.indexOf('\n', start) + 1
  const end = text.indexOf('\n', start)
  const line = text.slice(start, end < 0 ? undefined : end)
  const from = start + line.lastIndexOf(task.sourceLabel ?? task.label)
  return { from, to: from + task.label.length, text: task.label, taskOrdinal }
}
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
