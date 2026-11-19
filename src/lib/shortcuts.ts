import { captureDefault, shortcutLabel } from './inbox.ts'

export const commands = {
  capture: 'Quick Capture', search: 'Search notes', newNote: 'New note', save: 'Save note', closeTab: 'Close note tab',
  sidebar: 'Toggle sidebar', home: 'Go to Home', inbox: 'Go to Inbox', tasks: 'Go to Tasks', graph: 'Open graph', settings: 'Open Settings',
  source: 'Markdown editor', split: 'Split view', preview: 'Visual editor', trash: 'Open Trash', today: 'Open Today', template: 'New from template',
} as const
export type Command = keyof typeof commands
export type Bindings = Record<Command, string>

export const defaults: Bindings = {
  capture: captureDefault, search: 'Command+K', newNote: 'Command+N', save: 'Command+S', closeTab: 'Command+W',
  sidebar: 'Shift+Command+B', home: '', inbox: '', tasks: '', graph: 'Shift+Command+G', settings: 'Command+,',
  source: 'Command+1', split: 'Command+2', preview: 'Command+3', trash: '', today: 'Shift+Command+D', template: '',
}

const order = ['Control', 'Alt', 'Shift', 'Command']
const symbols: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Enter: '↵' }
const codes: Record<string, string> = { Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`', Minus: '-', Equal: '=' }
const reserve = new Set(['Command+Q', 'Command+H', 'Alt+Command+H', 'Command+M', 'Command+A', 'Command+C', 'Command+V', 'Command+X', 'Command+Z', 'Shift+Command+Z', 'Command+B', 'Command+I', 'Command+U'])
const localKey = /^[A-Z0-9,./;'\[\]\\`=\-]$|^F(?:[1-9]|1[0-9]|20)$|^(?:Arrow(?:Up|Down|Left|Right)|Enter|Space)$/
const unassigned = Object.fromEntries(Object.keys(commands).map((id) => [id, ''])) as Bindings

export function keyboardChord(event: KeyboardEvent) {
  const key = /^(?:Key|Digit)([A-Z0-9])$/.exec(event.code)?.[1] ?? codes[event.code] ?? event.code
  const modifiers = [event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Command'].filter(Boolean)
  if (!localKey.test(key) || !modifiers.length) return ''
  return [...modifiers, key].join('+')
}

export function displayShortcut(value: string) {
  const parts = value.split('+')
  return shortcutLabel(parts.map((key) => symbols[key] ?? key).join('+'))
}

export function shortcutIssue(command: Command, value: string, bindings: Bindings) {
  if (!value) return command === 'capture' ? 'Quick Capture needs a global shortcut.' : ''
  const parts = value.split('+'), key = parts.pop() ?? ''
  if (!localKey.test(key) || !parts.length || parts.join('+') !== order.filter((m) => parts.includes(m)).join('+')) return 'Use a modifier with a letter, number, or special key.'
  if (command === 'capture' && (parts.length < 2 || !/^[A-Z0-9]$/.test(key))) return 'Use two or more modifiers and a letter or number for Quick Capture.'
  if (!parts.includes('Command') && !parts.includes('Control') && parts.length === 1 && !/^F\d+$/.test(key)) return 'Add Command or Control to avoid interfering with typing.'
  if (reserve.has(value)) return 'That shortcut is reserved by macOS or the editor.'
  const other = (Object.keys(commands) as Command[]).find((id) => id !== command && bindings[id] === value)
  return other ? `Already used by ${commands[other]}.` : ''
}

const key = 'rightmark:shortcuts:v1'
export function readBindings(): Bindings {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<Bindings> | null
    const result = { ...defaults }
    for (const id of Object.keys(commands) as Command[]) {
      const value = stored?.[id]
      if (typeof value === 'string' && !shortcutIssue(id, value, unassigned)) result[id] = value
      else if (Object.entries(stored ?? {}).some(([other, chord]) => other !== id && chord && chord === result[id])) result[id] = ''
    }
    return (Object.keys(commands) as Command[]).some((id) => shortcutIssue(id, result[id], result)) ? { ...defaults } : result
  } catch { /* Defaults remain available. */ }
  return { ...defaults }
}

export function saveBindings(bindings: Bindings) { localStorage.setItem(key, JSON.stringify(bindings)) }
