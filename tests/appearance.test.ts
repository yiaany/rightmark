import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { effectiveTheme, parseTheme } from '../src/lib/appearance.ts'

test('unconfigured or invalid appearance uses Folio Dark', () => {
  assert.equal(parseTheme(null), 'dark')
  assert.equal(parseTheme('invalid'), 'dark')
  assert.equal(parseTheme('light'), 'light')
  assert.equal(parseTheme('system'), 'system')
})

test('only System follows the OS appearance', () => {
  assert.equal(effectiveTheme('system', true), 'dark')
  assert.equal(effectiveTheme('system', false), 'light')
  assert.equal(effectiveTheme('dark', false), 'dark')
  assert.equal(effectiveTheme('light', true), 'light')
})
