import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MarkdownManager } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { colorMarks } from '../src/lib/editor-color-marks.ts'
import { colorSpecs, isColorTag, readColorSpan } from '../src/lib/color-markdown.ts'
import { noteLinks, visualInputBlockReason } from '../src/lib/markdown.ts'

test('text color, highlight, and ordinary marks survive together through Markdown', () => {
  const md = new MarkdownManager({ extensions: [StarterKit, ...colorMarks] })
  const source = 'Begin **<span data-folio-color="sage"><mark data-folio-highlight="amber">both</mark></span>** end'
  const parsed = md.parse(source)
  const marks = parsed.content?.[0].content?.[1].marks ?? []
  assert.equal(marks.find((mark) => mark.type === 'textColor')?.attrs?.color, 'sage')
  assert.equal(marks.find((mark) => mark.type === 'highlight')?.attrs?.color, 'amber')
  assert.ok(marks.some((mark) => mark.type === 'bold'))
  const saved = md.serialize(parsed)
  assert.equal(saved, source)
  assert.deepEqual(md.parse(saved), parsed)
})

test('annotation parsing does not accept arbitrary attributes or consume inline code delimiters', () => {
  const highlight = colorSpecs[1]
  assert.equal(isColorTag('<mark data-folio-highlight="amber">'), true)
  assert.equal(isColorTag('<mark data-folio-highlight="unknown">'), false)
  assert.equal(isColorTag('<mark data-folio-highlight="amber" class="x">'), false)
  const markup = '<mark data-folio-highlight="amber">`</mark>` and words</mark>'
  assert.equal(readColorSpan(highlight, markup)?.inner, '`</mark>` and words')
  assert.equal(visualInputBlockReason(markup), '')
  assert.notEqual(visualInputBlockReason('<mark data-folio-highlight="unknown">text</mark>'), '')
  assert.deepEqual(noteLinks('<mark data-folio-highlight="amber">[[Scratchpad]]</mark>'), ['Scratchpad'])
})
