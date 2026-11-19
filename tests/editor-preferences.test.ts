import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { editorDefaults, parseEditorPreferences } from '../src/lib/editor-preferences.ts'

test('existing writing preferences keep their values when new settings are added', () => {
  assert.deepEqual(parseEditorPreferences('{"textSize":"large","blink":false}'), { ...editorDefaults, textSize: 'large', blink: false })
})

test('writing preferences validate persisted values independently', () => {
  assert.deepEqual(parseEditorPreferences('{"width":"wide","spacing":"relaxed","defaultView":"split","spellcheck":true,"textSize":"other"}'), {
    ...editorDefaults, width: 'wide', spacing: 'relaxed', defaultView: 'split', spellcheck: true,
  })
  assert.deepEqual(parseEditorPreferences('{"width":false,"spacing":0,"defaultView":"all","spellcheck":"true"}'), editorDefaults)
  assert.deepEqual(parseEditorPreferences(null), editorDefaults)
  assert.deepEqual(parseEditorPreferences('{'), editorDefaults)
})
