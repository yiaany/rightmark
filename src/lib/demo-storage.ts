import type { Storage } from './storage.ts'
import { appendCapture, asTask, captureTitle, inInbox } from './inbox.ts'

// Used only in a regular browser. The native bundle never opens this store.
export function demoStorage(): Storage {
  const fixtures = import.meta.glob('../../sample/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const sample = Object.fromEntries(Object.entries(fixtures).map(([path, text]) => [path.slice('../../sample/'.length), { text, modifiedAt: 0 }]))
  const key = 'folio:demo-files:v1'
  const files = () => {
    const record = localStorage.getItem(key)
    return record ? JSON.parse(record) as typeof sample : { ...sample }
  }
  const save = (contents: typeof sample) => localStorage.setItem(key, JSON.stringify(contents))
  let undo: { source: string; original: (typeof sample)[string]; path: string; before?: (typeof sample)[string]; after: string } | undefined

  function add(contents: typeof sample, folder: string, name: string, text: string) {
    const prefix = folder ? `${folder}/` : ''
    let path = `${prefix}${name}.md`, index = 1
    while (contents[path]) path = `${prefix}${name} ${++index}.md`
    const modifiedAt = Date.now()
    contents[path] = { text, modifiedAt }
    return { path, modifiedAt }
  }

  return {
    workspace: async () => ({ key: 'demo', name: 'Sample workspace', sample: true }),
    openFolder: async () => { throw new Error('Open Folder is available in the macOS app.') },
    list: async () => Object.entries(files()).map(([path, { modifiedAt }]) => ({ path, modifiedAt })),
    read: async (_, path) => {
      const note = files()[path]
      if (!note) throw new Error('This note could not be found.')
      return note.text
    },
    write: async (_, path, text, expected) => {
      const contents = files()
      if (contents[path]?.text !== expected) throw new Error('This note changed in another window.')
      contents[path] = { text, modifiedAt: Date.now() }
      save(contents)
    },
    create: async () => {
      const contents = files()
      const note = add(contents, '', 'Untitled', '')
      save(contents)
      return note
    },
    capture: async (text) => {
      const contents = files()
      add(contents, 'Inbox', captureTitle(text), text)
      save(contents)
    },
    listInbox: async () => Object.entries(files()).filter(([path]) => inInbox(path)).map(([path, { modifiedAt }]) => ({ path, modifiedAt, local: false })),
    readInbox: async (_, { path }) => {
      const note = files()[path]
      if (!note || !inInbox(path)) throw new Error('This Inbox note could not be found.')
      return note.text
    },
    processInbox: async (_, { path: source }, expected, action) => {
      const contents = files()
      const original = contents[source]
      if (!original || original.text !== expected || !inInbox(source)) throw new Error('This Inbox note changed. Select it again.')
      let path: string, before: (typeof sample)[string] | undefined
      if (action.kind === 'append') {
        path = action.target
        before = contents[path]
        if (!before || path.startsWith('Inbox/')) throw new Error('Choose a note outside Inbox.')
        contents[path] = { text: appendCapture(before.text, original.text), modifiedAt: Date.now() }
      } else {
        const folder = action.kind === 'move' ? action.folder : action.kind === 'archive' ? 'Archive' : ''
        path = add(contents, folder, captureTitle(original.text), action.kind === 'task' ? asTask(original.text) : original.text).path
      }
      delete contents[source]
      save(contents)
      undo = { source, original, path, before, after: contents[path].text }
      return path
    },
    undoInbox: async () => {
      const contents = files()
      if (!undo || contents[undo.source] || contents[undo.path]?.text !== undo.after) throw new Error('The note changed. Nothing was undone.')
      const { source, original, path, before } = undo
      contents[source] = original
      if (before) contents[path] = before
      else delete contents[path]
      save(contents)
      undo = undefined
      return path
    },
  }
}
