import { SvelteMap } from 'svelte/reactivity'
import { appendTask, localDate, moveTab, noteFolder, noteName, noteResolver, pathKey, resolveNote, scanTasks, setTaskDue, splitNote, toggleTask, validDate, type Note, type SearchMatch, type Task } from './notes.ts'
import { getStorage, type Draft, type Storage, type TrashItem, type WorkspaceInfo } from './storage.ts'
import type { InboxAction, InboxNote } from './inbox.ts'
import { noteReferences, type NoteReference } from './markdown.ts'
import { dailyPath, defaultTemplates, fillTemplate, notePath, rewriteMove, type Backlink } from './note-actions.ts'
import { readEditorPreferences } from './editor-preferences.ts'
import { readSession, storeSession, type SavedView } from './session-state.ts'
import { linkedAttachment, maxImageBytes, type ImageInsert } from './attachments.ts'

export type Mode = 'editor' | 'split' | 'preview'
export type Page = 'home' | 'today' | 'inbox' | 'tasks' | 'note' | 'graph' | 'settings' | 'trash'
export const taskFile = 'Tasks.md'

export class DocumentSession {
  text = $state('')
  saved = $state('')
  error = $state('')
  mode = $state<Mode>(readEditorPreferences().defaultView)
  scrollTop = 0
  richState?: unknown
  sourceState?: unknown
  searchHit = $state.raw<{ match: SearchMatch }>()
  syncView?: () => void
  insertEmoji = $state.raw<(emoji: string) => void>()
  insertImages = $state.raw<(files: File[]) => void>()
  jumpOutline = $state.raw<(ordinal: number, line: number) => void>()
  outlineLine = $state.raw<{ line: number }>()
  captureView?: () => void
  conflict = $state.raw<{ disk: string | null }>()
  recovered = $state(false)
  recoveryError = $state('')
  draft?: Draft
  pendingDraft?: Draft
  drafting?: Promise<void>
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
  inbox = $state.raw<InboxNote[]>([])
  trashItems = $state.raw<TrashItem[]>([])
  trashLoading = $state(false)
  trashError = $state('')
  trashBusy = $state(false)
  trashingPath = $state('')
  inboxProblem = $state('')
  canUndoInbox = $state(false)
  tasksByFile = new SvelteMap<string, Task[]>()
  index = new Map<string, string>()
  indexVersion = $state(0)
  indexing = $state(false)
  sessions = new SvelteMap<string, DocumentSession>()
  page = $state<Page>('home')
  activePath = $state('')
  active = $derived(this.sessions.get(this.activePath))
  dailyDate = $state('')
  dailyLoading = $state(false)
  dailySession = $derived(this.dailyDate ? this.sessions.get(dailyPath(this.dailyDate)) : undefined)
  currentDocument = $derived(this.page === 'today' ? this.dailySession : this.page === 'note' ? this.active : undefined)
  busy = $state(true)
  editingFiles = $state(false)
  error = $state('')
  private storage?: Storage
  private generation = 0
  private navigation = 0
  private refreshInboxVersion = 0
  private fileEpoch = 0
  private fileRefresh = Promise.resolve()
  private loads = new Map<string, Promise<string>>()
  private unreadable = new Set<string>()
  private references = new Map<string, { text: string; links: NoteReference[] }>()
  private views: Record<string, SavedView> = Object.create(null)
  private persistedDrafts = new Map<string, Draft>()
  private draftClock = 0
  private checking = false
  private lastTreeCheck = 0
  detachedDrafts = $state.raw<Draft[]>([])

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
    this.dailyDate = ''; this.dailyLoading = false
    this.tabs = []
    this.sessions.clear()
    this.persistedDrafts.clear()
    this.detachedDrafts = []
    const remembered = readSession(info.key)
    this.views = remembered?.views ?? Object.create(null)
    this.tasksByFile.clear()
    this.index.clear()
    this.references.clear()
    this.loads.clear()
    this.unreadable.clear()
    this.notes = []
    this.recent = []
    this.inbox = []
    this.trashItems = []
    this.trashError = ''
    this.trashLoading = false
    this.inboxProblem = ''
    this.canUndoInbox = false
    this.indexVersion++
    if (!this.storage) return
    const notes = await this.storage.list(info.key)
    try {
      for (const draft of await this.storage.loadDrafts(info.key)) {
        this.persistedDrafts.set(draft.path, draft)
        this.draftClock = Math.max(this.draftClock, draft.savedAt)
      }
    } catch { this.error = 'Recovery drafts could not be read.' }
    if (generation !== this.generation) return
    this.notes = notes.sort((a, b) => noteName(a.path).localeCompare(noteName(b.path), 'en', { numeric: true }))
    this.recent = this.readRecent(notes, info.sample)
    const known = new Set(notes.map(({ path }) => path))
    this.detachedDrafts = [...this.persistedDrafts.values()].filter(({ path }) => !known.has(path))
    // Preserve dirty notes even if they were not open in the last session (e.g. Today).
    this.tabs = [...new Set([...(remembered?.tabs ?? []), ...this.persistedDrafts.keys()])].filter((path) => known.has(path))
    const wanted = remembered?.active && this.tabs.includes(remembered.active) ? remembered.active : this.tabs.at(-1)
    if (remembered?.page === 'today') await this.today(validDate(remembered.date) ? remembered.date : localDate(), true)
    else if (wanted && (remembered?.page === 'note' || this.persistedDrafts.has(wanted))) await this.open(wanted)
    else if (remembered && ['inbox', 'tasks', 'graph', 'settings', 'trash'].includes(remembered.page)) this.page = remembered.page as Page
    void this.populateIndex(generation, this.recent.concat(notes.map(({ path }) => path)))
    await this.refreshInbox()
    if (this.page === 'trash') void this.refreshTrash()
  }

  remember() {
    if (!this.info || this.busy) return
    const current = this.currentDocument
    current?.captureView?.()
    const paths = new Set([...this.tabs, this.activePath, this.dailyDate ? dailyPath(this.dailyDate) : '', ...this.recent])
    for (const path of paths) { const session = this.sessions.get(path); if (session) this.views[path] = this.viewOf(session) }
    storeSession(this.info.key, { tabs: this.tabs, active: this.activePath, page: this.page, date: this.dailyDate, views: Object.fromEntries([...paths].flatMap((path) => this.views[path] ? [[path, this.views[path]]] : [])) })
  }

  private viewOf(session: DocumentSession): SavedView {
    return { mode: session.mode, scrollTop: session.scrollTop, richState: session.richState as SavedView['richState'], sourceState: session.sourceState }
  }

  private makeSession(path: string, key: string, text: string) {
    const session = new DocumentSession(path, key, text)
    const view = this.views[path]
    if (view) {
      if (view.mode) session.mode = view.mode
      session.scrollTop = view.scrollTop ?? 0; session.richState = view.richState; session.sourceState = view.sourceState
    }
    const draft = this.persistedDrafts.get(path)
    if (draft) {
      if (draft.text === text) void this.forgetDraft(path, key, draft.savedAt)
      else {
        session.text = draft.text; session.draft = draft; session.recovered = true
        if (draft.base !== text) { session.saved = draft.base; session.conflict = { disk: text } }
      }
    }
    return session
  }

  private async openSession(path: string, key: string) {
    const storage = this.storage
    if (!storage) throw new Error('No folder is open.')
    try { return this.makeSession(path, key, await storage.read(key, path)) }
    catch (error) {
      const draft = this.persistedDrafts.get(path)
      if (!draft) throw error
      const session = this.makeSession(path, key, draft.base)
      session.conflict = { disk: null }
      session.draft = draft
      return session
    }
  }

  async refreshInbox() {
    const key = this.info?.key, storage = this.storage
    if (!key || !storage) return
    const version = ++this.refreshInboxVersion
    try {
      const notes = await storage.listInbox(key)
      if (key !== this.info?.key || version !== this.refreshInboxVersion) return
      this.inbox = notes.sort((a, b) => b.modifiedAt - a.modifiedAt || a.path.localeCompare(b.path))
      this.inboxProblem = ''
    } catch (error) { if (key === this.info?.key && version === this.refreshInboxVersion) this.inboxProblem = String(error) }
  }

  async refreshTrash() {
    const key = this.info?.key, storage = this.storage
    if (!key || !storage) return
    this.trashLoading = true; this.trashError = ''
    try {
      const items = await storage.listTrash(key)
      if (this.info?.key === key) this.trashItems = items
    } catch (error) { if (this.info?.key === key) this.trashError = String(error) }
    finally { if (this.info?.key === key) this.trashLoading = false }
  }

  async moveToTrash(path: string) {
    const key = this.info?.key, storage = this.storage
    if (!key || !storage || this.busy || this.trashBusy || !this.notes.some((note) => note.path === path)) return
    this.trashBusy = true; this.trashingPath = path; this.error = ''
    try {
      const session = this.sessions.get(path)
      if (session && !(await this.save(session))) throw new Error('Save your changes before moving the note to Trash.')
      await storage.trash(key, path, session?.saved)
      if (this.info?.key !== key) return
      const wasActive = this.activePath === path && this.page === 'note'
      const tab = this.tabs.indexOf(path)
      if (this.activePath === path) { this.activePath = ''; if (wasActive) this.show('home') }
      await Promise.all([this.refreshFiles(), this.refreshInbox(), this.refreshTrash()])
      if (wasActive && this.page === 'home' && this.tabs.length) await this.open(this.tabs[Math.max(0, Math.min(tab, this.tabs.length - 1))])
    } catch (error) { this.error = error instanceof Error ? error.message : String(error) }
    finally { this.trashingPath = ''; this.trashBusy = false }
  }

  async processTrash(id: string, action: 'restore' | 'delete') {
    const key = this.info?.key, storage = this.storage
    if (!key || !storage || this.busy || this.trashBusy) return
    this.trashBusy = true; this.trashError = ''
    try {
      if (action === 'restore') {
        const changed = await storage.restoreTrash(key, id)
        if (this.info?.key !== key) return
        await Promise.all([this.refreshFiles(changed), this.refreshInbox(), this.refreshTrash()])
      } else { await storage.deleteTrash(key, id); await this.refreshTrash() }
    } catch (error) { this.trashError = error instanceof Error ? error.message : String(error) }
    finally { this.trashBusy = false }
  }

  private refreshFiles(changed?: string, external = false) {
    const generation = this.generation
    const request = this.fileRefresh.then(async () => {
      if (generation === this.generation) await this.reloadFiles(changed, external)
    })
    this.fileRefresh = request.catch(() => {})
    return request
  }

  private async reloadFiles(changed?: string, external = false) {
    const key = this.info?.key, storage = this.storage, generation = this.generation
    if (!key || !storage) return
    const notes = await storage.list(key)
    if (this.generation !== generation) return
    const known = new Map(this.notes.map(({ path, modifiedAt }) => [path, modifiedAt]))
    const next = new Set(notes.map(({ path }) => path))
    const hasDiff = notes.length !== known.size || notes.some(({ path, modifiedAt }) => known.get(path) !== modifiedAt)
    if ((!changed && !hasDiff) || (external && (this.busy || this.trashBusy))) return
    this.fileEpoch++
    this.loads.clear()
    for (const { path } of this.notes) {
      if (next.has(path)) continue
      const session = this.sessions.get(path)
      session?.syncView?.()
      if (external && session) {
        session.syncView?.()
        session.conflict = { disk: null }
        clearTimeout(session.timer)
        if (!session.draft) this.journal(session)
      } else if (!session || session.saved === session.text) {
        this.sessions.delete(path)
        this.tabs = this.tabs.filter((tab) => tab !== path)
        if (this.activePath === path) { this.activePath = ''; if (this.page === 'note') this.show('inbox') }
      }
      this.index.delete(path)
      this.references.delete(path)
      this.tasksByFile.delete(path)
      this.unreadable.delete(path)
    }
    this.recent = this.recent.filter((path) => next.has(path))
    this.notes = notes.sort((a, b) => noteName(a.path).localeCompare(noteName(b.path), 'en', { numeric: true }))
    if (external && hasDiff) {
      for (const { path, modifiedAt } of notes) {
        if (known.get(path) === modifiedAt) continue
        const session = this.sessions.get(path)
        if (!session) { this.index.delete(path); this.tasksByFile.delete(path); this.unreadable.delete(path); continue }
        if (session === this.currentDocument || session.saving) continue
        const expected = session.saved
        void storage.read(key, path).then((disk) => {
          if (generation !== this.generation || this.busy || this.sessions.get(path) !== session || session.saving || session.saved !== expected) return
          session.syncView?.()
          if (session.text === expected && !session.conflict) this.replaceSession(session, disk)
          else if (disk !== expected) { session.conflict = { disk }; clearTimeout(session.timer); if (!session.draft) this.journal(session) }
        }).catch(() => {})
      }
      void this.refreshInbox()
    }
    if (changed && next.has(changed)) {
      const previous = this.sessions.get(changed)
      const text = await storage.read(key, changed)
      if (this.generation !== generation) return
      if (previous && previous.saved === previous.text && this.sessions.get(changed) === previous) {
        const replacement = new DocumentSession(changed, key, text)
        replacement.mode = previous.mode
        replacement.scrollTop = previous.scrollTop
        this.sessions.set(changed, replacement)
      }
      this.indexText(changed, text)
    }
    this.indexVersion++
    for (const { path } of notes) if (!this.index.has(path) && !this.unreadable.has(path)) void this.read(path).catch(() => {})
  }

  async captured() {
    try { await Promise.all([this.refreshFiles(), this.refreshInbox()]) }
    catch (error) { this.error = String(error) }
  }

  async readInbox(note: InboxNote) {
    if (!this.storage || !this.info) throw new Error('The Inbox is unavailable.')
    return this.storage.readInbox(this.info.key, note)
  }

  async processInbox(note: InboxNote, expected: string, action: InboxAction) {
    const key = this.info?.key, storage = this.storage
    if (!key || !storage || this.busy) throw new Error('The workspace is unavailable.')
    if (!(await this.flush())) throw new Error('Save your changes before processing Inbox.')
    const changed = await storage.processInbox(key, note, expected, action)
    if (key !== this.info?.key) return
    this.canUndoInbox = true
    await this.updateInbox(changed)
  }

  async undoInbox() {
    const key = this.info?.key, storage = this.storage
    if (!key || !storage || this.busy) return
    if (!(await this.flush())) throw new Error('Save your changes before undoing.')
    const changed = await storage.undoInbox(key)
    if (key !== this.info?.key) return
    this.canUndoInbox = false
    await this.updateInbox(changed)
  }

  private async updateInbox(changed: string) {
    try { await Promise.all([this.refreshFiles(changed), this.refreshInbox()]) }
    catch (error) { this.error = `The Inbox changed, but the file list could not refresh: ${String(error)}` }
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
    if (this.busy || this.trashBusy || !this.storage) return
    this.remember()
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
    const epoch = this.fileEpoch
    const request = storage.read(key, path).then((text) => {
      if (generation === this.generation && epoch === this.fileEpoch) this.indexText(path, text)
      return text
    }).catch((error: unknown) => {
      if (generation === this.generation && epoch === this.fileEpoch) this.unreadable.add(path)
      throw error
    }).finally(() => {
      if (generation === this.generation && this.loads.get(path) === request) this.loads.delete(path)
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

  async open(path: string, focus = true, match?: SearchMatch) {
    const key = this.info?.key
    if (!key || this.trashingPath === path || (!this.notes.some((note) => note.path === path) && !this.sessions.get(path)?.conflict)) return
    const navigation = focus ? ++this.navigation : this.navigation
    try {
      if (!this.sessions.has(path)) {
        const loaded = await this.openSession(path, key)
        if (key !== this.info?.key || this.trashingPath === path || !this.notes.some((note) => note.path === path)) return
        if (!this.sessions.has(path)) {
          this.sessions.set(path, loaded)
          const disk = loaded.conflict ? loaded.conflict.disk : loaded.saved
          if (disk !== null && this.index.get(path) !== disk) this.indexText(path, disk)
        }
      }
      if (!this.tabs.includes(path)) this.tabs = [...this.tabs, path]
      if (!focus || navigation !== this.navigation) return
      this.currentDocument?.syncView?.()
      this.currentDocument?.captureView?.()
      const target = this.sessions.get(path)
      if (target) target.searchHit = match ? { match } : undefined
      this.activePath = path
      this.page = 'note'
      this.error = ''
      this.recent = [path, ...this.recent.filter((item) => item !== path)].slice(0, 12)
      try { localStorage.setItem(`folio:recent:${key}`, JSON.stringify(this.recent)) } catch { /* optional history */ }
    } catch (error) {
      if (navigation === this.navigation) this.error = `Could not open ${noteName(path)}: ${String(error)}`
    }
  }

  show(page: Exclude<Page, 'note' | 'today'>) {
    const active = this.currentDocument ?? this.active
    active?.syncView?.()
    active?.captureView?.()
    if (active?.text !== active?.saved && active) void this.save(active)
    this.navigation++
    this.page = page
  }

  async close(path: string) {
    const document = this.sessions.get(path)
    if (document && !(await this.save(document))) return
    const index = this.tabs.indexOf(path)
    this.tabs = this.tabs.filter((tab) => tab !== path)
    if (document) this.views[path] = this.viewOf(document)
    if (!(this.page === 'today' && this.dailySession === document)) this.sessions.delete(path)
    if (this.activePath !== path || this.page !== 'note') return
    const next = this.tabs[Math.min(index, this.tabs.length - 1)]
    if (next) void this.open(next)
    else { this.activePath = ''; this.show('home') }
  }

  reorder(from: string, to: string) { this.tabs = moveTab(this.tabs, from, to) }

  async create() {
    const key = this.info?.key
    if (!key || !this.storage || this.busy || this.editingFiles) return
    try {
      const note = await this.storage.create(key)
      if (this.info?.key !== key) return
      this.notes = [...this.notes, note].sort((a, b) => noteName(a.path).localeCompare(noteName(b.path), 'en', { numeric: true }))
      this.indexText(note.path, '')
      await this.open(note.path)
    } catch (error) { this.error = String(error) }
  }

  get templates() { return this.notes.filter(({ path }) => path.startsWith('Templates/')) }

  private async ensureNamed(path: string, text = '', existing = false, duringLoad = false) {
    const key = this.info?.key, storage = this.storage
    if (!key || !storage || (this.busy && !duringLoad) || this.editingFiles) throw new Error('The workspace is busy.')
    const note = await storage.createNamed(key, path, text, existing)
    if (this.info?.key !== key) throw new Error('The workspace changed.')
    if (!this.notes.some((item) => item.path === note.path)) {
      this.notes = [...this.notes, note].sort((a, b) => noteName(a.path).localeCompare(noteName(b.path), 'en', { numeric: true }))
      if (!existing) this.indexText(note.path, text)
      else await this.read(note.path)
      if (note.path.startsWith('Inbox/')) await this.refreshInbox()
    }
    return note.path
  }

  async createLinked(name: string, from: string) { return this.ensureNamed(notePath(name, noteFolder(from))) }

  async today(date = localDate(), duringLoad = false) {
    if ((this.busy && !duringLoad) || this.editingFiles) return
    const key = this.info?.key, path = dailyPath(date)
    if (!key || !validDate(date)) return
    const active = this.currentDocument
    active?.syncView?.()
    active?.captureView?.()
    if (active && active.text !== active.saved) void this.save(active)
    const request = ++this.navigation
    this.page = 'today'
    this.dailyDate = date
    this.dailyLoading = true
    this.error = ''
    try {
      if (this.dailySession) return
      if (!this.notes.some((item) => item.path === path)) {
        if (date !== localDate()) return
        await this.ensureNamed(path, `# ${date}\n\n## Meetings\n\n## Decisions\n\n## Notes & tasks\n`, true, duringLoad)
      }
      const loaded = await this.openSession(path, key)
      if (this.navigation !== request || key !== this.info?.key || this.trashingPath === path || !this.notes.some((item) => item.path === path)) return
      if (!this.sessions.has(path)) this.sessions.set(path, loaded)
    } catch (error) { if (request === this.navigation) this.error = error instanceof Error ? error.message : String(error) }
    finally { if (this.dailyDate === date && (request === this.navigation || this.page !== 'today')) this.dailyLoading = false }
  }

  async addTask(path: string, title: string, due = '') {
    const key = this.info?.key, storage = this.storage
    if (!key || !storage || this.busy || this.trashBusy || this.editingFiles) throw new Error('The workspace is busy.')
    const initial = appendTask('# Tasks\n', title, due)
    this.busy = true; this.editingFiles = true
    try {
      if (path === taskFile && !this.notes.some((note) => note.path === path)) {
        const note = await storage.createNamed(key, path, initial, false)
        this.notes = [...this.notes, note].sort((a, b) => noteName(a.path).localeCompare(noteName(b.path), 'en', { numeric: true }))
        this.indexText(note.path, initial)
        return
      }
      if (!this.notes.some((note) => note.path === path) || path.startsWith('Templates/')) throw new Error('Choose a note in the current workspace.')
      const session = this.sessions.get(path)
      if (session && !(await this.save(session))) throw new Error(session.error)
      const before = session?.saved ?? await storage.read(key, path)
      const next = appendTask(before, title, due)
      await storage.write(key, path, next, before)
      if (session && this.sessions.get(path) === session) {
        const replacement = new DocumentSession(path, key, next)
        replacement.mode = session.mode; replacement.scrollTop = session.scrollTop
        this.sessions.set(path, replacement)
      }
      this.indexText(path, next)
    } finally { this.busy = false; this.editingFiles = false }
  }

  async installTemplates() {
    for (const { title, text } of defaultTemplates) await this.ensureNamed(notePath(title, 'Templates'), text, true)
  }

  async createFromTemplate(template: string, name: string, folder: string) {
    if (!this.templates.some(({ path }) => path === template)) throw new Error('Choose a template from the Templates folder.')
    const path = notePath(name, folder)
    const text = await this.read(template)
    await this.open(await this.ensureNamed(path, fillTemplate(text, noteName(path))))
  }

  backlinks(path: string): Backlink[] {
    this.indexVersion
    const resolve = noteResolver(this.notes)
    const incoming: Backlink[] = []
    for (const file of this.notes) {
      if (file.path === path) continue
      const text = this.sessions.get(file.path)?.text ?? this.index.get(file.path)
      if (!text) continue
      const cached = this.references.get(file.path)
      const links = cached?.text === text ? cached.links : noteReferences(text)
      if (cached?.text !== text) this.references.set(file.path, { text, links })
      const ordinals = new Map<string, number>()
      for (const link of links) {
        const id = `${link.kind}:${link.target}`, ordinal = ordinals.get(id) ?? 0
        ordinals.set(id, ordinal + 1)
        if (resolve(link.target, file.path) === path) incoming.push({ ...link, path: file.path, match: { ...link.match, link: { kind: link.kind, target: link.target, ordinal } } })
      }
    }
    return incoming
  }

  async move(path: string, name: string, folder: string) {
    const key = this.info?.key, storage = this.storage
    if (!key || !storage || this.busy || this.trashBusy || this.editingFiles) throw new Error('The workspace is busy.')
    const destination = notePath(name, folder, /\.markdown$/i.test(path) ? path.slice(-9) : path.slice(-3))
    if (path === destination) throw new Error('Choose a different name or folder.')
    this.editingFiles = true
    this.busy = true
    try {
      if (!(await this.flush())) throw new Error('Save your changes before moving the note.')
      const { files, revision } = await storage.moveSnapshot(key)
      const current = new Map(files.map((file) => [file.path, file.text]))
      if (files.some((file) => pathKey(file.path) === pathKey(destination))) throw new Error('A note already uses that name at the destination. For a capitalization-only change, use a temporary name first.')
      if ([...this.sessions].some(([path, session]) => current.get(path) !== session.saved)) throw new Error('An open note changed outside rightmark. Close and reopen it before moving.')
      const changes = rewriteMove(files, path, destination)
      const result = await storage.moveNote(key, { source: path, destination, changes, revision })
      this.fileEpoch++
      this.loads.clear()
      const edited = new Map(changes.map((file) => [file.path, file.text]))
      for (const [oldPath, text] of current) {
        const nextPath = oldPath === path ? destination : oldPath
        const nextText = edited.get(oldPath) ?? text
        const previous = this.sessions.get(oldPath)
        if (previous && (oldPath !== nextPath || previous.text !== nextText)) {
          const replacement = new DocumentSession(nextPath, key, nextText)
          replacement.mode = previous.mode
          replacement.scrollTop = previous.scrollTop
          this.sessions.delete(oldPath)
          this.sessions.set(nextPath, replacement)
        }
        if (this.index.get(nextPath) !== nextText) this.indexText(nextPath, nextText)
      }
      this.notes = this.notes.map((note) => note.path === path ? { ...note, path: destination } : note)
      this.index.delete(path); this.tasksByFile.delete(path); this.references.delete(path)
      this.tabs = this.tabs.map((tab) => tab === path ? destination : tab)
      this.recent = this.recent.map((item) => item === path ? destination : item)
      if (this.activePath === path) this.activePath = destination
      try { localStorage.setItem(`folio:recent:${key}`, JSON.stringify(this.recent)) } catch { /* optional history */ }
      try { await Promise.all([this.refreshFiles(), this.refreshInbox()]) }
      catch { this.error = 'The note moved, but the file list could not refresh.' }
      if (result.warning) this.error = result.warning
    } finally { this.busy = false; this.editingFiles = false }
  }

  async versions(path: string) {
    const key = this.info?.key, storage = this.storage
    if (!key || !storage) throw new Error('The workspace is unavailable.')
    return storage.listVersions(key, path)
  }

  async version(path: string, id: string) {
    const key = this.info?.key, storage = this.storage
    if (!key || !storage) throw new Error('The workspace is unavailable.')
    return storage.readVersion(key, path, id)
  }

  async restoreVersion(path: string, id: string, expected: string) {
    const key = this.info?.key, storage = this.storage, session = this.sessions.get(path)
    if (!key || !storage || !session || this.busy || this.trashBusy) throw new Error('The note is unavailable.')
    this.busy = true; this.editingFiles = true
    try {
      if (!(await this.save(session))) throw new Error(session.error)
      if (session.text !== expected) throw new Error('The current note changed. Reopen history to compare again.')
      const text = await storage.readVersion(key, path, id)
      await storage.write(key, path, text, session.saved)
      const replacement = new DocumentSession(path, key, text)
      replacement.mode = session.mode; replacement.scrollTop = session.scrollTop
      this.sessions.set(path, replacement)
      this.indexText(path, text)
      if (path.startsWith('Inbox/')) await this.refreshInbox()
    } finally { this.editingFiles = false; this.busy = false }
  }

  update(document: DocumentSession, text: string) {
    if (document.text === text) return
    document.text = text
    this.journal(document)
    clearTimeout(document.timer)
    document.timer = setTimeout(() => void this.save(document), 350)
  }

  private journal(document: DocumentSession) {
    const storage = this.storage
    if (!storage) return
    const savedAt = this.draftClock = Math.max(Date.now(), this.draftClock + 1)
    document.draft = document.pendingDraft = { path: document.path, text: document.text, base: document.saved, savedAt }
    if (!document.drafting) document.drafting = (async () => {
      while (document.pendingDraft) {
        const draft = document.pendingDraft
        document.pendingDraft = undefined
        try { await storage.saveDraft(document.key, draft); document.recoveryError = '' }
        catch (error) { document.recoveryError = `Could not save a recovery copy: ${String(error)}` }
      }
    })().finally(() => { document.drafting = undefined })
  }

  private async forgetDraft(path: string, key: string, through: number) {
    if ((this.persistedDrafts.get(path)?.savedAt ?? Infinity) <= through) this.persistedDrafts.delete(path)
    try { await this.storage?.clearDraft(key, path, through) } catch { /* An identical draft is ignored at next launch. */ }
  }

  private async clearJournal(document: DocumentSession, through: Draft | undefined = document.draft) {
    if (!through) return
    await document.drafting
    if (document.draft === through) { document.draft = undefined; document.recovered = false }
    await this.forgetDraft(document.path, document.key, through.savedAt)
  }

  async save(document: DocumentSession): Promise<boolean> {
    document.syncView?.()
    clearTimeout(document.timer)
    if (document.saving) return document.saving
    if (document.conflict) { await document.drafting; return false }
    const storage = this.storage
    if (!storage) return false
    if (document.saved === document.text) { document.error = ''; await this.clearJournal(document); return true }
    document.saving = this.writePending(storage, document).finally(() => { document.saving = undefined })
    return document.saving
  }

  private async writePending(storage: Storage, document: DocumentSession) {
    try {
      // One writer per document. A keystroke during an in-flight write gets the next revision.
      while (document.saved !== document.text) {
        const snapshot = document.text
        const draft = document.draft
        await document.drafting
        await storage.write(document.key, document.path, snapshot, document.saved)
        document.saved = snapshot
        if (this.info?.key === document.key) this.indexText(document.path, snapshot)
        if (document.text === snapshot) await this.clearJournal(document, draft)
        else this.journal(document)
      }
      document.error = ''
      return true
    } catch (error) {
      const disk = await storage.read(document.key, document.path).catch(() => null)
      if (disk !== document.saved) { document.conflict = { disk }; document.error = '' }
      else document.error = String(error)
      return false
    }
  }

  private replaceSession(session: DocumentSession, disk: string) {
    session.captureView?.()
    const replacement = new DocumentSession(session.path, session.key, disk)
    replacement.mode = session.mode; replacement.scrollTop = session.scrollTop
    replacement.richState = session.richState; replacement.sourceState = session.sourceState
    this.sessions.set(session.path, replacement)
    if (this.index.get(session.path) !== disk) this.indexText(session.path, disk)
  }

  async checkExternal(includeTree = false) {
    const storage = this.storage, key = this.info?.key
    if (!storage || !key || this.busy || this.editingFiles || this.trashBusy || this.checking) return
    this.checking = true
    try {
      const active = this.currentDocument
      const read = async (session: DocumentSession) => {
        if (session.saving || session.conflict) return
        const expected = session.saved
        const disk = await storage.read(key, session.path).catch(() => null)
        if (this.info?.key !== key || this.sessions.get(session.path) !== session || session.saving || session.saved !== expected || this.busy || this.trashBusy) return
        if (disk === expected) return
        session.syncView?.()
        if (session.saving || session.saved !== expected) return
        if (disk !== null && (session.text === expected || session.text === disk)) {
          void this.clearJournal(session)
          this.replaceSession(session, disk)
        } else {
          session.conflict = { disk }
          clearTimeout(session.timer)
          if (!session.draft) this.journal(session)
        }
      }
      if (active) await read(active)
      if (!includeTree && Date.now() - this.lastTreeCheck < 4000) return
      this.lastTreeCheck = Date.now()
      await this.refreshFiles(undefined, true)
    } catch { /* A disconnected disk may return on the next focus. Keep open text. */ }
    finally { this.checking = false }
  }

  async useDisk(session: DocumentSession, shown: string) {
    const storage = this.storage
    if (!storage || this.busy || this.sessions.get(session.path) !== session) throw new Error('The note is no longer available.')
    const latest = await storage.read(session.key, session.path).catch(() => null)
    if (latest !== shown) { session.conflict = { disk: latest }; throw new Error('The file changed again. Review the latest version.') }
    // Only the snapshot the user chose to discard is cleared, even if the next write races I/O.
    session.syncView?.()
    const draft = session.draft
    this.replaceSession(session, shown)
    await this.clearJournal(session, draft)
  }

  async keepCopy(source: DocumentSession | Draft) {
    const storage = this.storage, key = this.info?.key
    if (!storage || !key || this.busy) throw new Error('The workspace is busy.')
    const session = source instanceof DocumentSession ? source : undefined
    session?.syncView?.()
    const text = source.text
    const name = [...noteName(source.path)].slice(0, 45).join('').replace(/^[. ]+|[\\:*?"<>|#\[\]\u0000-\u001f]/g, ' ').trim() || 'Note'
    // Use the source folder so relative Markdown links keep working in the recovered copy.
    const folder = noteFolder(source.path)
    const dest = [folder, `${name} — recovered ${crypto.randomUUID().slice(0, 8)}.md`].filter(Boolean).join('/')
    const copy = await this.ensureNamed(dest, text)
    if (session && session.text === text && session.conflict) {
      const disk = await storage.read(key, session.path).catch(() => null)
      session.syncView?.()
      if (this.sessions.get(session.path) === session && session.text === text) {
        const draft = session.draft
        if (disk !== null) this.replaceSession(session, disk)
        else {
          this.sessions.delete(session.path)
          this.tabs = this.tabs.filter((path) => path !== session.path)
          await this.refreshFiles(undefined, true).catch(() => {})
        }
        await this.clearJournal(session, draft)
      }
    } else if (!session) {
      await this.forgetDraft(source.path, key, (source as Draft).savedAt)
      this.detachedDrafts = this.detachedDrafts.filter((draft) => draft !== source)
    }
    await this.open(copy)
    return copy
  }

  async attachImage(session: DocumentSession, file: File): Promise<ImageInsert> {
    if (!this.storage || this.info?.key !== session.key || this.currentDocument !== session || this.editingFiles || this.trashingPath === session.path) throw new Error('This note is no longer available.')
    if (file.size > maxImageBytes) throw new Error('An image can be at most 16 MB.')
    const path = await this.storage.saveImage(session.key, await file.arrayBuffer())
    return { src: linkedAttachment(session.path, path), alt: [...(file.name.replace(/\.[^.]+$/, '').replace(/[\r\n]/g, ' ').trim() || 'Image')].slice(0, 160).join('') }
  }

  readImage(key: string, path: string) { return this.storage ? this.storage.readImage(key, path) : Promise.reject(new Error('No workspace is open.')) }

  async flush() {
    this.remember()
    return (await Promise.all([...this.sessions.values()].map((document) => this.save(document)))).every(Boolean)
  }

  async persistForExit() {
    if (await this.flush()) return true
    const dirty = [...this.sessions.values()].filter((session) => session.text !== session.saved || session.conflict)
    for (const session of dirty) if (!session.draft || session.recoveryError) this.journal(session)
    await Promise.all(dirty.map((session) => session.drafting))
    return dirty.every((session) => !!session.draft && !session.recoveryError)
  }

  async changeTask(task: Task, date?: string) {
    const key = this.info?.key
    if (!key || !this.storage || this.busy || this.trashBusy) return
    try {
      const original = await this.read(task.path)
      if (key !== this.info?.key) return
      const document = this.sessions.get(task.path) ?? new DocumentSession(task.path, key, original)
      document.syncView?.()
      const text = date === undefined ? toggleTask(document.text, task) : setTaskDue(document.text, task, date)
      if (text === undefined) throw new Error('This task has changed. Open its note to update it.')
      if (!this.sessions.has(task.path)) this.sessions.set(task.path, document)
      document.richState = undefined
      document.sourceState = undefined
      this.update(document, text)
      if (!(await this.save(document))) throw new Error(document.error)
      if (!this.tabs.includes(task.path) && document.text === document.saved) this.sessions.delete(task.path)
    } catch (error) { this.error = error instanceof Error ? error.message : String(error) }
  }

  async follow(target: string, from: string) {
    this.currentDocument?.syncView?.()
    const path = resolveNote(target, from, this.notes)
    if (!path) { this.error = `Could not find “${target}” in this folder.`; return }
    const anchor = target.split('#').slice(1).join('#')
    let match: SearchMatch | undefined
    if (anchor) try {
      const text = await this.read(path), decoded = decodeURIComponent(anchor)
      const slug = (title: string) => title.trim().toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '').replace(/\s+/g, '-')
      const offset = splitNote(text).frontmatter.length
      for (const heading of text.slice(offset).matchAll(/^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*\r?$/gm)) {
        if (heading[1] !== decoded && slug(heading[1]) !== slug(decoded)) continue
        const from = offset + heading.index + heading[0].indexOf(heading[1]); match = { from, to: from + heading[1].length, text: heading[1] }; break
      }
    } catch { /* Opening the file reports read errors. */ }
    await this.open(path, true, match)
  }

  get unreadableCount() { this.indexVersion; this.indexing; return this.unreadable.size }
}
