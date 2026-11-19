import type { Draft, Storage } from './storage.ts'
import { base64Image, imageFormat, maxImageBytes } from './attachments.ts'
import { appendCapture, asTask, captureTitle, inInbox } from './inbox.ts'
import { pathKey } from './notes.ts'

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
  const draftsKey = 'rightmark:demo-drafts:v1'
  const drafts = () => JSON.parse(localStorage.getItem(draftsKey) ?? '[]') as Draft[]
  const imageKey = (path: string) => `rightmark:demo-image:${path}`
  const trashPrefix = '.rightmark-trash/'
  const active = (contents: typeof sample) => Object.entries(contents).filter(([path]) => !path.startsWith('.'))
  const snapshot = (contents: typeof sample) => active(contents).map(([path, { text }]) => ({ path, text })).sort((a, b) => a.path.localeCompare(b.path))
  const history = (path: string) => `.rightmark-history/${encodeURIComponent(path)}/`
  const versions = (contents: typeof sample, path: string) => Object.keys(contents).filter((key) => key.startsWith(history(path))).sort((a, b) => contents[b].modifiedAt - contents[a].modifiedAt)
  function remember(contents: typeof sample, path: string, text: string) {
    const existing = versions(contents, path)
    if (contents[existing[0]]?.text === text) return
    contents[history(path) + crypto.randomUUID()] = { text, modifiedAt: Date.now() }
    for (const key of existing.slice(29)) delete contents[key]
  }
  const trashPath = (contents: typeof sample, id: string) => Object.keys(contents).find((path) => path.startsWith(`${trashPrefix}${id}/`))
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
    list: async () => active(files()).map(([path, { modifiedAt }]) => ({ path, modifiedAt })),
    read: async (_, path) => {
      const note = files()[path]
      if (!note) throw new Error('This note could not be found.')
      return note.text
    },
    write: async (_, path, text, expected) => {
      const contents = files()
      if (contents[path]?.text !== expected) throw new Error('This note changed in another window.')
      if (expected === text) return
      remember(contents, path, expected)
      contents[path] = { text, modifiedAt: Date.now() }
      save(contents)
    },
    loadDrafts: async () => drafts(),
    saveDraft: async (_, draft) => {
      const items = drafts()
      if (items.some((item) => item.path === draft.path && item.savedAt > draft.savedAt)) return
      localStorage.setItem(draftsKey, JSON.stringify([...items.filter((item) => item.path !== draft.path), draft]))
    },
    clearDraft: async (_, path, through) => localStorage.setItem(draftsKey, JSON.stringify(drafts().filter((draft) => draft.path !== path || draft.savedAt > through))),
    saveImage: async (_, buffer) => {
      const bytes = new Uint8Array(buffer), ext = imageFormat(bytes)
      if (!ext || bytes.length > maxImageBytes) throw new Error('Choose a PNG, JPEG, GIF, WebP, or AVIF image under 16 MB.')
      const name = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), (byte) => byte.toString(16).padStart(2, '0')).join('')
      const path = `Attachments/${name}.${ext}`
      localStorage.setItem(imageKey(path), base64Image(buffer))
      return path
    },
    readImage: async (_, path) => {
      const encoded = localStorage.getItem(imageKey(path))
      if (!encoded) throw new Error('Image not found.')
      return Uint8Array.from(atob(encoded), (ch) => ch.charCodeAt(0)).buffer
    },
    create: async () => {
      const contents = files()
      const note = add(contents, '', 'Untitled', '')
      save(contents)
      return note
    },
    createNamed: async (_, path, text, openExisting) => {
      const contents = files(), existing = Object.keys(contents).find((item) => pathKey(item) === pathKey(path))
      if (existing) {
        if (openExisting) return { path: existing, modifiedAt: contents[existing].modifiedAt }
        throw new Error('A note already exists at that path.')
      }
      const modifiedAt = Date.now()
      contents[path] = { text, modifiedAt }; save(contents)
      return { path, modifiedAt }
    },
    moveSnapshot: async () => { const entries = snapshot(files()); return { files: entries, revision: JSON.stringify(entries) } },
    moveNote: async (_, plan) => {
      const contents = files()
      if (JSON.stringify(snapshot(contents)) !== plan.revision) throw new Error('The workspace changed. Try again to recalculate its links.')
      if (Object.keys(contents).some((path) => pathKey(path) === pathKey(plan.destination))) throw new Error('A file already exists at the destination.')
      if (!contents[plan.source]) throw new Error('The original note no longer exists.')
      remember(contents, plan.source, contents[plan.source].text)
      for (const { path, text } of plan.changes) {
        if (!contents[path]) throw new Error('A linked note no longer exists.')
        remember(contents, path, contents[path].text)
        contents[path] = { text, modifiedAt: Date.now() }
      }
      contents[plan.destination] = contents[plan.source]; delete contents[plan.source]
      for (const key of versions(contents, plan.source)) {
        contents[history(plan.destination) + key.slice(history(plan.source).length)] = contents[key]; delete contents[key]
      }
      for (const key of versions(contents, plan.destination).slice(30)) delete contents[key]
      save(contents)
      return { warning: null }
    },
    listVersions: async (_, path) => {
      const contents = files()
      return versions(contents, path).map((key) => ({ id: key.slice(history(path).length), savedAt: contents[key].modifiedAt }))
    },
    readVersion: async (_, path, id) => {
      const version = files()[history(path) + id]
      if (!version) throw new Error('This version is unavailable.')
      return version.text
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
        remember(contents, path, before.text)
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
      if (before) { remember(contents, path, contents[path].text); contents[path] = before }
      else delete contents[path]
      save(contents)
      undo = undefined
      return path
    },
    listTrash: async () => Object.entries(files()).filter(([path]) => path.startsWith(trashPrefix)).map(([path, file]) => {
      const relative = path.slice(trashPrefix.length), slash = relative.indexOf('/')
      return { id: relative.slice(0, slash), path: relative.slice(slash + 1), deletedAt: file.modifiedAt }
    }).sort((a, b) => b.deletedAt - a.deletedAt),
    trash: async (_, path, expected) => {
      const contents = files(), file = contents[path]
      if (!file || path.startsWith(trashPrefix)) throw new Error('This note could not be found.')
      if (expected !== undefined && expected !== file.text) throw new Error('This note changed in another window.')
      contents[`${trashPrefix}${crypto.randomUUID()}/${path}`] = { text: file.text, modifiedAt: Date.now() }
      delete contents[path]; save(contents)
    },
    restoreTrash: async (_, id) => {
      const contents = files(), source = trashPath(contents, id)
      if (!source) throw new Error('This note is no longer in Trash.')
      const path = source.slice(trashPrefix.length + id.length + 1)
      if (contents[path]) throw new Error('A file already exists at the original location.')
      contents[path] = contents[source]; delete contents[source]; save(contents)
      return path
    },
    deleteTrash: async (_, id) => {
      const contents = files(), source = trashPath(contents, id)
      if (!source) throw new Error('This note is no longer in Trash.')
      delete contents[source]; save(contents)
    },
  }
}
