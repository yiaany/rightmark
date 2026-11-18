import { SvelteMap } from 'svelte/reactivity'
import { moveTab, noteName, resolveNote, scanTasks, toggleTask, type Note, type Task } from './notes.ts'
import { getStorage, type Storage, type WorkspaceInfo } from './storage.ts'

export type Mode = 'editor' | 'split' | 'preview'
export type Page = 'home' | 'tasks' | 'note'

export class DocumentSession {
  text = $state('')
  saved = $state('')
  error = $state('')
  mode = $state<Mode>('preview')
  scrollTop = 0
  richState?: unknown
  sourceState?: unknown
  syncView?: () => void
  timer?: ReturnType<typeof setTimeout>
  saving?: Promise<boolean>

  constructor(readonly path: string, readonly key: string, text: string) {
    this.text = this.saved = text
  }
}

export class Workspace {
  info = $state<WorkspaceInfo>()
  notes = $state.raw<Note[]>([])
  tabs = $state.raw<string[]>([])
  recent = $state.raw<string[]>([])
  tasksByFile = new SvelteMap<string, Task[]>()
  index = new Map<string, string>()
  indexVersion = $state(0)
  indexing = $state(false)
  sessions = new SvelteMap<string, DocumentSession>()
  page = $state<Page>('home')
  activePath = $state('')
  active = $derived(this.sessions.get(this.activePath))
  busy = $state(true)
  error = $state('')
  private storage?: Storage
  private generation = 0
  private navigation = 0
  private loads = new Map<string, Promise<string>>()
  private unreadable = new Set<string>()

  async start() {
    try {
      this.storage = await getStorage()
      await this.load(await this.storage.workspace())
    } catch (error) {
      this.error = String(error)
    } finally {
      this.busy = false
    }
  }

  private async load(info: WorkspaceInfo) {
    const generation = ++this.generation
    this.navigation++
    this.info = info
    this.page = 'home'
    this.activePath = ''
    this.tabs = []
    this.sessions.clear()
    this.tasksByFile.clear()
    this.index.clear()
    this.loads.clear()
    this.unreadable.clear()
    this.notes = []
    this.recent = []
    this.indexVersion++
    if (!this.storage) return
    const notes = await this.storage.list(info.key)
    if (generation !== this.generation) return
    this.notes = notes.sort((a, b) => noteName(a.path).localeCompare(noteName(b.path), 'en', { numeric: true }))
    this.recent = this.readRecent(notes, info.sample)
    void this.populateIndex(generation, this.recent.concat(notes.map(({ path }) => path)))
  }

  private readRecent(notes: Note[], sample: boolean) {
    let saved: unknown
    try { saved = JSON.parse(localStorage.getItem(`folio:recent:${this.info?.key}`) ?? 'null') } catch { /* optional history */ }
    const known = new Set(notes.map((note) => note.path))
    const lastModified = [...notes].sort((a, b) => b.modifiedAt - a.modifiedAt).map(({ path }) => path)
    const preferred = sample ? ['Start here.md', 'Field Notes/Studio refresh.md', 'Scratchpad.md', 'Field Notes/Walk through the studio.md', 'Reference/Light and color.md', 'Field Notes/Reading list.md'] : []
    return [...new Set([...(Array.isArray(saved) ? saved : []), ...preferred, ...lastModified])].filter((path) => known.has(path)).slice(0, 12)
  }

  private async populateIndex(generation: number, paths: string[]) {
    this.indexing = true
    try {
      const unique = [...new Set(paths)]
      for (let start = 0; start < unique.length && this.generation === generation; start += 12) {
        await Promise.allSettled(unique.slice(start, start + 12).map((path) => this.read(path)))
        // Yield between batches; opening a file and typing take priority.
        if (start + 12 < unique.length) await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    } finally {
      if (generation === this.generation) this.indexing = false
    }
  }

  async chooseFolder() {
    if (this.busy || !this.storage) return
    this.busy = true
    this.error = ''
    try {
      if (!(await this.flush())) throw new Error('Save your edits before switching folders.')
      const info = await this.storage.openFolder()
      if (info && info.key !== this.info?.key) await this.load(info)
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error)
    } finally {
      this.busy = false
    }
  }

  async read(path: string): Promise<string> {
    const open = this.sessions.get(path)
    if (open) return open.text
    const key = this.info?.key
    const storage = this.storage
    if (!key || !storage) throw new Error('No folder is open.')
    const cached = this.index.get(path)
    if (cached !== undefined) return cached
    const running = this.loads.get(path)
    if (running) return running
    const generation = this.generation
    const request = storage.read(key, path).then((text) => {
      if (generation === this.generation) this.indexText(path, text)
      return text
    }).catch((error: unknown) => {
      if (generation === this.generation) this.unreadable.add(path)
      throw error
    }).finally(() => {
      if (generation === this.generation) this.loads.delete(path)
    })
    this.loads.set(path, request)
    return request
  }

  private indexText(path: string, text: string) {
    this.unreadable.delete(path)
    this.index.set(path, text)
    const tasks = scanTasks(path, text)
    if (tasks.length) this.tasksByFile.set(path, tasks)
    else this.tasksByFile.delete(path)
    this.indexVersion++
  }

  async open(path: string, focus = true) {
    const key = this.info?.key
    if (!key) return
    const navigation = focus ? ++this.navigation : this.navigation
    try {
      if (!this.sessions.has(path)) {
        const text = await this.read(path)
        if (key !== this.info?.key) return
        if (!this.sessions.has(path)) this.sessions.set(path, new DocumentSession(path, key, text))
      }
      if (!this.tabs.includes(path)) this.tabs = [...this.tabs, path]
      if (!focus || navigation !== this.navigation) return
      this.active?.syncView?.()
      this.activePath = path
      this.page = 'note'
      this.error = ''
      this.recent = [path, ...this.recent.filter((item) => item !== path)].slice(0, 12)
      try { localStorage.setItem(`folio:recent:${key}`, JSON.stringify(this.recent)) } catch { /* optional history */ }
    } catch (error) {
      if (navigation === this.navigation) this.error = `Could not open ${noteName(path)}: ${String(error)}`
    }
  }

  show(page: 'home' | 'tasks') {
    const active = this.active
    active?.syncView?.()
    if (active?.text !== active?.saved && active) void this.save(active)
    this.navigation++
    this.page = page
  }

  async close(path: string) {
    const document = this.sessions.get(path)
    if (document && !(await this.save(document))) return
    const index = this.tabs.indexOf(path)
    this.tabs = this.tabs.filter((tab) => tab !== path)
    this.sessions.delete(path)
    if (this.activePath !== path || this.page !== 'note') return
    const next = this.tabs[Math.min(index, this.tabs.length - 1)]
    if (next) void this.open(next)
    else { this.activePath = ''; this.show('home') }
  }

  reorder(from: string, to: string) { this.tabs = moveTab(this.tabs, from, to) }

  async create() {
    const key = this.info?.key
    if (!key || !this.storage || this.busy) return
    try {
      const note = await this.storage.create(key)
      if (this.info?.key !== key) return
      this.notes = [...this.notes, note].sort((a, b) => noteName(a.path).localeCompare(noteName(b.path), 'en', { numeric: true }))
      this.indexText(note.path, '')
      await this.open(note.path)
    } catch (error) { this.error = String(error) }
  }

  update(document: DocumentSession, text: string) {
    if (document.text === text) return
    document.text = text
    clearTimeout(document.timer)
    document.timer = setTimeout(() => void this.save(document), 350)
  }

  async save(document: DocumentSession): Promise<boolean> {
    document.syncView?.()
    clearTimeout(document.timer)
    if (document.saving) return document.saving
    const storage = this.storage
    if (!storage) return false
    if (document.saved === document.text) { document.error = ''; return true }
    document.saving = this.writePending(storage, document).finally(() => { document.saving = undefined })
    return document.saving
  }

  private async writePending(storage: Storage, document: DocumentSession) {
    try {
      // One writer per document. A keystroke during an in-flight write gets the next revision.
      while (document.saved !== document.text) {
        const snapshot = document.text
        await storage.write(document.key, document.path, snapshot, document.saved)
        document.saved = snapshot
        if (this.info?.key === document.key) this.indexText(document.path, snapshot)
      }
      document.error = ''
      return true
    } catch (error) {
      document.error = String(error)
      return false
    }
  }

  async flush() {
    return (await Promise.all([...this.sessions.values()].map((document) => this.save(document)))).every(Boolean)
  }

  async changeTask(task: Task) {
    const key = this.info?.key
    if (!key || !this.storage) return
    try {
      const original = await this.read(task.path)
      if (key !== this.info?.key) return
      const document = this.sessions.get(task.path) ?? new DocumentSession(task.path, key, original)
      const text = toggleTask(document.text, task)
      if (text === undefined) throw new Error('This task has changed. Open its note to update it.')
      if (!this.sessions.has(task.path)) this.sessions.set(task.path, document)
      document.richState = undefined
      document.sourceState = undefined
      this.update(document, text)
      if (!(await this.save(document))) throw new Error(document.error)
      if (!this.tabs.includes(task.path) && document.text === document.saved) this.sessions.delete(task.path)
    } catch (error) { this.error = error instanceof Error ? error.message : String(error) }
  }

  follow(target: string, from: string) {
    const path = resolveNote(target, from, this.notes)
    if (path) void this.open(path)
    else this.error = `Could not find “${target}” in this folder.`
  }

  get unreadableCount() { this.indexVersion; this.indexing; return this.unreadable.size }
}
