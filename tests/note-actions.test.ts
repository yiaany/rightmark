import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { localMarkdownTarget, noteReferences } from '../src/lib/markdown.ts'
import { normalizeEditorLink } from '../src/lib/editor-link.ts'
import { dailyPath, fillTemplate, markdownDiff, notePath, rewriteMove, wikiAttributes, wikiChoices, wikiQuery } from '../src/lib/note-actions.ts'
import { localDate, noteResolver, scanTasks, setTaskDue, taskLocation, taskTiming, toggleTask } from '../src/lib/notes.ts'

test('note suggestions keep namesakes distinct and tolerate a closing pair after the caret', () => {
  const notes = ['Notes/Plan.md', 'Other/Plan.md', 'Notes/Draft.markdown'].map((path) => ({ path, modifiedAt: 0 }))
  assert.deepEqual(wikiQuery('Look at [[Pl', 'an]] next'), { from: 8, to: 16, query: 'Pl' })
  assert.equal(wikiQuery('![[Pl', ''), undefined)
  assert.deepEqual(wikiChoices(notes, 'plan', 'Notes/Source.md').sort(), ['Notes/Plan.md', 'Other/Plan.md'])
  const chosen = wikiAttributes('Other/Plan.md', 'Notes/Source.md', notes)!
  assert.equal(noteResolver(notes)(chosen.target, 'Notes/Source.md'), 'Other/Plan.md')
  assert.equal(noteResolver(notes)('/Plan.md', 'Notes/Source.md'), undefined)
})

test('backlinks retain precise offsets and context for repeated links, CRLF, and nested blocks', () => {
  const text = '---\r\nkey: "[[Hidden]]"\r\n---\r\n> `[[Plan]]` first [[Plan]]\r\n> second [[Plan]]\r\n\r\n- Outer\r\n  - child [[Plan#Anchor|third]]\r\n\r\n[Fourth](<../Plan Notes.md#one> "A title")\r\n'
  const links = noteReferences(text)
  assert.equal(links.length, 4)
  assert.equal(links[0].match.from, text.indexOf('[[Plan]]', text.indexOf('first')))
  assert.equal(links[1].match.from, text.indexOf('[[Plan]]', text.indexOf('second')))
  assert.equal(links[2].match.text, '[[Plan#Anchor|third]]')
  assert.equal(links[3].target, '../Plan Notes.md#one')
  assert.equal(links[3].replacement('./New.md#one'), '[Fourth](./New.md#one "A title")')
  assert.match(links[1].context, /second \[\[Plan\]\]/)
})

test('the link field, click targets and backlinks agree on local note names and escaped paths', () => {
  const source = 'Projects/Source.md', target = 'Reference/Studio (100%).md'
  const resolve = noteResolver([source, target].map((path) => ({ path, modifiedAt: 0 })))
  const href = normalizeEditorLink('Studio (100%)#Details', { path: source, resolve: (name) => resolve(name, source) })!
  assert.equal(href, '../Reference/Studio%20%28100%25%29.md#Details')
  assert.equal(normalizeEditorLink(href, { path: source, resolve: (name) => resolve(name, source) }), href)
  const refs = noteReferences(`[An update](${href}) and [the source](./Source).`)
  assert.equal(refs[0].target, localMarkdownTarget(href))
  assert.equal(refs[0].label, 'An update')
  assert.equal(resolve(refs[0].target, source), target)
  assert.equal(resolve(refs[1].target, target), undefined)
  assert.equal(resolve(refs[1].target, source), source)
  assert.equal(localMarkdownTarget('https://example.com/a.md'), undefined)
  assert.equal(localMarkdownTarget('//example.com/a.md'), undefined)
})

test('move rewrites incoming and outgoing links without altering code, labels, fragments or CRLF', () => {
  const files = [
    { path: 'Work/Plan.md', text: 'Read [Peer](./Peer.md#details "Summary"), [[Peer#Details|the peer]], and [[#Here]].\r\n' },
    { path: 'Work/Peer.md', text: '' },
    { path: 'Archive/Peer.md', text: '' },
    { path: 'Index.md', text: '[[Plan|the plan]] and [See](Work/Plan.md#part). `[[Plan]]`\r\n\r\n[ref]: Work/Plan.md "Title"\r\n\r\n[Referenced][ref]\r\n\r\n```md\r\n[[Plan]]\r\n```\r\n' },
  ]
  const changed = rewriteMove(files, 'Work/Plan.md', 'Archive/New Plan.md')
  assert.deepEqual(changed, [
    { path: 'Work/Plan.md', text: 'Read [Peer](../Work/Peer.md#details "Summary"), [[/Work/Peer.md#Details|the peer]], and [[#Here]].\r\n' },
    { path: 'Index.md', text: '[[/Archive/New Plan.md|the plan]] and [See](./Archive/New%20Plan.md#part). `[[Plan]]`\r\n\r\n[ref]: Work/Plan.md "Title"\r\n\r\n[Referenced](./Archive/New%20Plan.md "Title")\r\n\r\n```md\r\n[[Plan]]\r\n```\r\n' },
  ])
})

test('move preserves links to other notes if a new sibling would steal their name', () => {
  const files = [
    { path: 'Old.md', text: '' }, { path: 'Plan.md', text: '' }, { path: 'Work/Read.md', text: '[[Plan]]' },
  ]
  assert.deepEqual(rewriteMove(files, 'Old.md', 'Work/Plan.md'), [{ path: 'Work/Read.md', text: '[[/Plan.md]]' }])
})

test('due dates stay in the matching Markdown checkbox and skip invalid dates and completed items', () => {
  const text = '- [ ] Same\r\n- [ ] Same 📅 2026-11-19  \r\n- [ ] Third due:2026-11-18\r\n- [x] Done 📅 2026-11-18\r\n- [ ] Invalid 📅 2026-02-30\r\n'
  const tasks = scanTasks('A.md', text)
  assert.deepEqual(tasks.map((item) => taskTiming(item, '2026-11-19')), [undefined, 'Today', 'Overdue', undefined, undefined])
  assert.equal(taskLocation(text, tasks[1])?.from, text.indexOf('Same 📅'))
  assert.equal(toggleTask(text, tasks[1]), text.replace('- [ ] Same 📅', '- [x] Same 📅'))
  assert.equal(setTaskDue(text, tasks[1], ''), text.replace(' 📅 2026-11-19', ''))
  assert.equal(setTaskDue(text, tasks[1], '2028-02-29'), text.replace('2026-11-19', '2028-02-29'))
  assert.equal(setTaskDue(text, tasks[1], '2027-02-29'), undefined)
})

test('daily filenames are calendar-local and templates interpolate only documented placeholders', () => {
  assert.equal(dailyPath(localDate(new Date(2026, 0, 3, 23))), 'Daily/2026-01-03.md')
  assert.equal(notePath('Team meeting', 'Projects/Studio'), 'Projects/Studio/Team meeting.md')
  assert.throws(() => notePath('Team meeting', '../Projects'))
  assert.equal(fillTemplate('# {{title}}\n{{date}} / {{unknown}}', 'Planning', '2026-11-19'), '# Planning\n2026-11-19 / {{unknown}}')
})

test('history diff highlights additions and removals without changing identical lines', () => {
  assert.deepEqual(markdownDiff('Heading\nBefore\nEnd', 'Heading\nAfter\nEnd'), [
    { kind: 'same', text: 'Heading' }, { kind: 'removed', text: 'Before' }, { kind: 'added', text: 'After' }, { kind: 'same', text: 'End' },
  ])
})
