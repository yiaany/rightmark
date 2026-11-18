import type { Storage } from './storage.ts'

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
      let index = 1
      let path = 'Untitled.md'
      while (contents[path]) path = `Untitled ${++index}.md`
      const modifiedAt = Date.now()
      contents[path] = { text: '', modifiedAt }
      save(contents)
      return { path, modifiedAt }
    },
  }
}
