import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { buildGraph, filterGraph } from '../src/lib/graph.ts'
import { noteLinks } from '../src/lib/markdown.ts'

test('Markdown links are parsed without mistaking code, comments or images for notes', () => {
  const text = '---\nlabel: "[[Ignored]]"\n---\nSee [[One|first]], [Two](../Two%20Notes.md#top) and `[[Inline code]]`.\n\n```md\n[[Fence]]\n```\n\n<!-- [[Comment]] -->\n\n![Image](other.md)\n'
  assert.deepEqual(noteLinks(text), ['One', '../Two Notes.md#top'])
})

test('the graph deduplicates links, resolves siblings and leaves ambiguous names unlinked', () => {
  const paths = ['x/First.md', 'x/Other.md', 'y/Other.md', 'Third.md', 'Alone.md']
  const notes = paths.map((path) => ({ path, modifiedAt: 0 }))
  const graph = buildGraph(notes, new Map([
    ['x/First.md', '[[Other]] [[Other#Title]] [[Third]] [[First]]'],
    ['x/Other.md', '[[y/Other]]'], ['Third.md', '[[Other]]'],
  ]))
  assert.deepEqual(graph.links, [
    { source: 'x/First.md', target: 'x/Other.md' }, { source: 'x/First.md', target: 'Third.md' },
    { source: 'x/Other.md', target: 'y/Other.md' },
  ])
  assert.equal(graph.nodes.find(({ id }) => id === 'x/Other.md')?.incoming, 1)
  assert.deepEqual(filterGraph(graph, 'x/First.md', 1, true).nodes.map(({ id }) => id), ['x/First.md', 'x/Other.md', 'Third.md'])
  assert.equal(filterGraph(graph, 'x/First.md', 2, true).nodes.length, 4)
  assert.equal(filterGraph(graph, '', 1, false).nodes.length, 4)
})
