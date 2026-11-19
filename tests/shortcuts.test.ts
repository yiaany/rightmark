import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { defaults, displayShortcut, keyboardChord, shortcutIssue } from '../src/lib/shortcuts.ts'

test('app shortcuts use stable physical keys and canonical modifier order', () => {
  const chord = keyboardChord({ code: 'KeyK', key: 'л', metaKey: true, shiftKey: true } as KeyboardEvent)
  assert.equal(chord, 'Shift+Command+K')
  assert.equal(displayShortcut(chord), '⇧⌘K')
  assert.equal(keyboardChord({ code: 'KeyK' } as KeyboardEvent), '')
})

test('shortcuts detect conflicts and protect system and editor keystrokes', () => {
  assert.match(shortcutIssue('search', defaults.save, defaults), /Save note/)
  assert.match(shortcutIssue('search', 'Command+C', defaults), /reserved/)
  assert.match(shortcutIssue('capture', 'Command+F3', defaults), /two or more/)
  assert.equal(shortcutIssue('search', '', defaults), '')
  assert.equal(shortcutIssue('preview', 'Control+Alt+ArrowUp', defaults), '')
})
