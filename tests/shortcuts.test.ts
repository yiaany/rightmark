import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { defaultBindings, displayShortcut, keyboardChord, shortcutIssue } from '../src/lib/shortcuts.ts'

const defaults = defaultBindings(false)

test('app shortcuts use stable physical keys and canonical modifier order', () => {
  const chord = keyboardChord({ code: 'KeyK', key: 'л', metaKey: true, shiftKey: true } as KeyboardEvent)
  assert.equal(chord, 'Shift+Command+K')
  assert.equal(displayShortcut(chord, false), '⇧⌘K')
  assert.equal(keyboardChord({ code: 'KeyK' } as KeyboardEvent), '')
})

test('shortcuts detect conflicts and protect system and editor keystrokes', () => {
  assert.match(shortcutIssue('search', defaults.save, defaults, false), /Save note/)
  assert.match(shortcutIssue('search', 'Command+C', defaults, false), /reserved/)
  assert.match(shortcutIssue('capture', 'Command+F3', defaults, false), /two or more/)
  assert.equal(shortcutIssue('search', '', defaults, false), '')
  assert.equal(shortcutIssue('preview', 'Control+Alt+ArrowUp', defaults, false), '')
})

test('Windows uses Control for app shortcuts and keeps the capture chord and editing keys', () => {
  const bindings = defaultBindings(true)
  assert.equal(bindings.search, 'Control+K')
  assert.equal(bindings.today, 'Control+Shift+D')
  assert.equal(bindings.capture, 'Control+Shift+N')
  assert.equal(displayShortcut(bindings.today, true), 'Ctrl+Shift+D')
  assert.equal(keyboardChord({ code: 'KeyK', ctrlKey: true } as KeyboardEvent), bindings.search)
  assert.match(shortcutIssue('search', 'Control+V', bindings, true), /reserved/)
  assert.equal(Object.entries(bindings).find(([id, chord]) => chord && shortcutIssue(id as keyof typeof bindings, chord, bindings, true)), undefined)
})
