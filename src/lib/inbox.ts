import type { Note } from './notes.ts'

export type InboxNote = Note & { local: boolean }
export type InboxAction = { kind: 'move'; folder: string } | { kind: 'append'; target: string } | { kind: 'task' } | { kind: 'archive' }
export type CaptureShortcut = { shortcut: string; error: string | null }

export const captureDefault = 'Control+Shift+N'
export const inboxId = (note: InboxNote) => `${note.local ? 'local' : 'workspace'}:${note.path}`
export const inInbox = (path: string) => /^Inbox\/[^/]+\.(md|markdown)$/i.test(path) && path.startsWith('Inbox/')

export function captureTitle(text: string) {
  const line = (text.split(/\r?\n/).find((line) => line.trim()) ?? '').trim().replace(/^[#\->* ]+/, '')
  return [...line.replace(/[\\/:*?"<>|]/g, ' ').replace(/[\x00-\x1f\x7f]/g, '').replace(/\s+/g, ' ')].slice(0, 60).join('').replace(/^[ .]+|[ .]+$/g, '') || 'Quick note'
}

export function asTask(text: string) {
  const [first, ...rest] = text.trimStart().split('\n')
  const details = rest.join('\n')
  return `- [ ] ${first.trim().replace(/^- \[[ xX]\] /, '')}\n${details ? `\n${details}` : ''}`
}

export function appendCapture(before: string, capture: string) {
  const newline = before.includes('\r\n') ? '\r\n' : '\n'
  const join = !before || before.endsWith(newline.repeat(2)) ? '' : before.endsWith(newline) ? newline : newline.repeat(2)
  return before + join + capture.replace(/^[\r\n]+/, '')
}

export function shortcutLabel(shortcut: string) {
  const symbols: Record<string, string> = { Control: '⌃', Alt: '⌥', Shift: '⇧', Command: '⌘' }
  return shortcut.split('+').map((key) => symbols[key] ?? key).join('')
}

export function shortcutFrom(event: KeyboardEvent) {
  const key = /^(?:Key|Digit)([A-Z0-9])$/.exec(event.code)?.[1]
  if (!key) return
  const mods = [event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Command'].filter(Boolean)
  if (mods.length >= 2) return [...mods, key].join('+')
}
