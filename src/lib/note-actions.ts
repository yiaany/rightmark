import { noteImages, noteReferences, type NoteReference } from './markdown.ts'
import { relativeWorkspacePath, workspaceImage } from './attachments.ts'
import { relativeMarkdown } from './editor-link.ts'
import { localDate, noteFolder, noteName, noteResolver, pathKey, type Note } from './notes.ts'

export type FileText = { path: string; text: string }
export type MovePlan = { source: string; destination: string; revision: string; changes: FileText[] }

export function notePath(name: string, folder: string, extension = '.md') {
  const title = name.trim().replace(/\.(md|markdown)$/i, '')
  const parts = folder.trim() ? folder.trim().split('/') : []
  const bad = (part: string) => !part || part.startsWith('.') || part !== part.trim() || /[/\\:*?"<>|\[\]#\u0000-\u001f]/.test(part) || new TextEncoder().encode(part).length > 220
  if (bad(title)) throw new Error('Enter a note name without slashes, brackets, or #.')
  if (parts.some(bad)) throw new Error('Enter a folder inside the workspace, like Projects/Research.')
  return [...parts, title + extension].join('/')
}

export function wikiAttributes(path: string, from: string, notes: Note[]) {
  const label = noteName(path)
  const resolve = noteResolver(notes)
  if (!/[\[\]|#\n]/.test(label) && resolve(label, from) === path && notes.filter((note) => pathKey(noteName(note.path)) === pathKey(label)).length === 1) return { target: label, label: '' }
  if (/[\[\]|#\n]/.test(path)) return
  const target = `/${path}`
  if (resolve(target, from) === path) return { target, label: '' }
}

export function rewriteMove(files: FileText[], source: string, destination: string): FileText[] {
  const notes = files.map(({ path }) => ({ path, modifiedAt: 0 }))
  const before = noteResolver(notes)
  const after = noteResolver(notes.map((note) => note.path === source ? { ...note, path: destination } : note))
  return files.flatMap(({ path, text }) => {
    const nextPath = path === source ? destination : path
    const edits: { from: number; to: number; text: string }[] = []
    for (const ref of noteReferences(text)) {
      const oldTarget = before(ref.target, path)
      if (!oldTarget) continue
      const nextTarget = oldTarget === source ? destination : oldTarget
      if (after(ref.target, nextPath) === nextTarget && !(ref.kind === 'markdown' && !ref.target.startsWith('#') && (nextPath !== path || nextTarget !== oldTarget))) continue
      const hash = ref.target.indexOf('#'), anchor = hash < 0 ? '' : ref.target.slice(hash)
      const target = ref.kind === 'wiki' ? `/${nextTarget}` : relativeMarkdown(nextPath, nextTarget)
      if (ref.kind === 'wiki' && /[\[\]|#\n]/.test(nextTarget)) throw new Error(`A link in ${path} cannot be updated because its target uses special characters.`)
      if (after(ref.kind === 'wiki' ? target : decodeURIComponent(target), nextPath) !== nextTarget) throw new Error(`A link in ${path} would become ambiguous.`)
      edits.push({ ...ref.match, text: ref.replacement(target + anchor) })
    }
    if (path === source && noteFolder(path) !== noteFolder(destination)) {
      for (const ref of noteImages(text)) {
        const target = workspaceImage(ref.href, source)
        if (!target || workspaceImage(ref.href, destination) === target) continue
        edits.push({ from: ref.from, to: ref.to, text: ref.replacement(relativeWorkspacePath(destination, target)) })
      }
    }
    if (!edits.length) return []
    let next = text
    for (const edit of edits.sort((a, b) => b.from - a.from)) next = next.slice(0, edit.from) + edit.text + next.slice(edit.to)
    return next === text ? [] : [{ path, text: next }]
  })
}

export function wikiQuery(before: string, after: string) {
  const match = /(?:^|[^!\\])\[\[([^\[\]|\r\n]{0,180})$/.exec(before)
  if (!match) return
  const query = match[1], closing = /^([^\[\]|\r\n]*)\]\]/.exec(after)
  return { from: before.length - query.length - 2, to: before.length + (closing?.[0].length ?? 0), query }
}

export function wikiChoices(notes: Note[], query: string, from: string) {
  const value = pathKey(query.trim()), resolve = noteResolver(notes)
  return notes.map(({ path }) => {
    const title = pathKey(noteName(path))
    const rank = title === value ? 0 : title.startsWith(value) ? 1 : title.includes(value) ? 2 : pathKey(path).includes(value) ? 3 : 4
    return { path, rank }
  }).filter(({ rank, path }) => rank < 4 && !/[\[\]|#\n]/.test(path) && resolve(`/${path}`, from) === path)
    .sort((a, b) => a.rank - b.rank || noteName(a.path).localeCompare(noteName(b.path)) || a.path.localeCompare(b.path)).slice(0, 24).map(({ path }) => path)
}

export type Backlink = NoteReference & { path: string }
export const dailyPath = (date = localDate()) => `Daily/${date}.md`
export const fillTemplate = (template: string, title: string, date = localDate()) => template.replace(/\{\{\s*(title|date)\s*\}\}/g, (_, key: string) => key === 'title' ? title : date)
export const defaultTemplates = [
  { title: 'Meeting', text: '# {{title}}\n\nDate: {{date}}\n\n## Attendees\n\n## Agenda\n\n## Decisions\n\n## Follow-ups\n' },
  { title: 'Research', text: '# {{title}}\n\n## Question\n\n## Sources\n\n## Findings\n\n## Open questions\n' },
  { title: 'Weekly review', text: '# {{title}}\n\nWeek of {{date}}\n\n## Wins\n\n## What’s still open\n\n## Next week\n' },
] as const

export function markdownDiff(before: string, after: string) {
  const a = before ? before.split('\n') : [], b = after ? after.split('\n') : []
  type Line = { kind: 'same' | 'added' | 'removed'; text: string }
  const rows: Line[] = []
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) rows.push({ kind: 'same', text: a[i++] })
  let endA = a.length, endB = b.length
  while (endA > i && endB > i && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  const width = endB - i + 1, height = endA - i + 1
  // Bound the quadratic part so a large paste cannot stall the history panel.
  const table = width * height <= 300_000 ? new Uint32Array(width * height) : undefined
  if (table) for (let x = height - 2; x >= 0; x--) for (let y = width - 2; y >= 0; y--) {
    table[x * width + y] = a[i + x] === b[i + y] ? 1 + table[(x + 1) * width + y + 1] : Math.max(table[(x + 1) * width + y], table[x * width + y + 1])
  }
  let x = 0, y = 0
  while (x < height - 1 || y < width - 1) {
    if (table && x < height - 1 && y < width - 1 && a[i + x] === b[i + y]) { rows.push({ kind: 'same', text: a[i + x++] }); y++ }
    else if (x < height - 1 && (y === width - 1 || !table || table[(x + 1) * width + y] >= table[x * width + y + 1])) rows.push({ kind: 'removed', text: a[i + x++] })
    else rows.push({ kind: 'added', text: b[i + y++] })
  }
  for (; endA < a.length; endA++) rows.push({ kind: 'same', text: a[endA] })
  return rows
}
