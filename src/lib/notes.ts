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

export function searchNotes(notes: Note[], textFor: (path: string) => string | undefined, query: string) {
  const value = query.trim().toLocaleLowerCase()
  if (!value) return notes.slice(0, 30).map((note) => ({ ...note, excerpt: '' }))
  return notes.flatMap((note) => {
    const title = noteName(note.path).toLocaleLowerCase()
    const body = textFor(note.path) ?? ''
    const offset = body.toLocaleLowerCase().indexOf(value)
    const rank = title.startsWith(value) ? 0 : title.includes(value) ? 1 : note.path.toLocaleLowerCase().includes(value) ? 2 : 3
    if (offset < 0 && rank === 3) return []
    const start = Math.max(0, offset - 24, body.lastIndexOf('\n', offset) + 1)
    const end = body.indexOf('\n', offset)
    const excerpt = offset < 0 ? '' : body.slice(start, Math.min(offset + 72, end < 0 ? body.length : end)).trim()
    return [{ ...note, rank, excerpt }]
  }).sort((a, b) => a.rank - b.rank).slice(0, 30)
}

export function moveTab(paths: string[], from: string, to: string) {
  if (from === to || !paths.includes(from) || !paths.includes(to)) return paths
  const next = paths.filter((path) => path !== from)
  next.splice(paths.indexOf(to), 0, from)
  return next
}
