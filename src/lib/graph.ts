import { noteLinks } from './markdown.ts'
import { noteFolder, noteName, type Note } from './notes.ts'

export type GraphNote = { id: string; title: string; incoming: number }
export type GraphLink = { source: string; target: string }
export type NoteGraph = { nodes: GraphNote[]; links: GraphLink[] }

function key(path: string) {
  return path.normalize('NFC').toLocaleLowerCase().replace(/\.(md|markdown)$/i, '')
}

export function buildGraph(notes: Note[], text: ReadonlyMap<string, string>, cache = new Map<string, { text: string; links: string[] }>()): NoteGraph {
  const paths = new Map<string, GraphNote>()
  const names = new Map<string, GraphNote | null>()
  const nodes = notes.map(({ path }) => ({ id: path, title: noteName(path), incoming: 0 }))
  for (const node of nodes) {
    paths.set(key(node.id), node)
    const name = key(node.title)
    names.set(name, names.has(name) ? null : node)
  }

  const links: GraphLink[] = []
  for (const node of nodes) {
    const body = text.get(node.id)
    if (!body) continue
    const cached = cache.get(node.id)
    const targets = cached?.text === body ? cached.links : noteLinks(body)
    cache.set(node.id, { text: body, links: targets })
    const seen = new Set<string>()
    for (const raw of targets) {
      const target = raw.split('#')[0].trim()
      if (!target) continue
      const parts = target.startsWith('/') ? [] : noteFolder(node.id).split('/').filter(Boolean)
      for (const part of target.split('/')) {
        if (part === '..') parts.pop()
        else if (part && part !== '.') parts.push(part)
      }
      const found = paths.get(key(parts.join('/'))) ?? paths.get(key(target.replace(/^\//, ''))) ?? names.get(key(target))
      if (!found || found === node || seen.has(found.id)) continue
      seen.add(found.id)
      found.incoming++
      links.push({ source: node.id, target: found.id })
    }
  }
  return { nodes, links }
}

export function filterGraph(graph: NoteGraph, root: string, depth: number, orphans: boolean): NoteGraph {
  if (!root && orphans) return graph
  const neighbors = new Map<string, string[]>()
  for (const { source, target } of graph.links) {
    if (!neighbors.has(source)) neighbors.set(source, [])
    if (!neighbors.has(target)) neighbors.set(target, [])
    neighbors.get(source)!.push(target)
    neighbors.get(target)!.push(source)
  }
  if (!root) return { nodes: graph.nodes.filter(({ id }) => neighbors.has(id)), links: graph.links }
  const visible = new Set([root])
  let frontier = [root]
  for (let level = 0; level < depth && frontier.length; level++) {
    const next: string[] = []
    for (const id of frontier) for (const neighbor of neighbors.get(id) ?? []) {
      if (!visible.has(neighbor)) { visible.add(neighbor); next.push(neighbor) }
    }
    frontier = next
  }
  return { nodes: graph.nodes.filter(({ id }) => visible.has(id)), links: graph.links.filter(({ source, target }) => visible.has(source) && visible.has(target)) }
}
