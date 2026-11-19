import { invoke, isTauri } from '@tauri-apps/api/core'
import type { Note } from './notes.ts'
import type { CaptureShortcut, InboxAction, InboxNote } from './inbox.ts'
import type { FileText, MovePlan } from './note-actions.ts'
import { base64Image } from './attachments.ts'

export type WorkspaceInfo = { key: string; name: string; sample: boolean }
export type TrashItem = { id: string; path: string; deletedAt: number }
export type Version = { id: string; savedAt: number }
export type Draft = { path: string; text: string; base: string; savedAt: number }

export interface Storage {
  workspace(): Promise<WorkspaceInfo>
  openFolder(): Promise<WorkspaceInfo | null>
  list(key: string): Promise<Note[]>
  read(key: string, path: string): Promise<string>
  write(key: string, path: string, text: string, expected: string): Promise<void>
  loadDrafts(key: string): Promise<Draft[]>
  saveDraft(key: string, draft: Draft): Promise<void>
  clearDraft(key: string, path: string, through: number): Promise<void>
  saveImage(key: string, bytes: ArrayBuffer): Promise<string>
  readImage(key: string, path: string): Promise<ArrayBuffer>
  create(key: string): Promise<Note>
  createNamed(key: string, path: string, text: string, openExisting: boolean): Promise<Note>
  moveSnapshot(key: string): Promise<{ revision: string; files: FileText[] }>
  moveNote(key: string, plan: MovePlan): Promise<{ warning: string | null }>
  listVersions(key: string, path: string): Promise<Version[]>
  readVersion(key: string, path: string, id: string): Promise<string>
  capture(text: string): Promise<void>
  listInbox(key: string): Promise<InboxNote[]>
  readInbox(key: string, note: InboxNote): Promise<string>
  processInbox(key: string, note: InboxNote, expected: string, action: InboxAction): Promise<string>
  undoInbox(key: string): Promise<string>
  listTrash(key: string): Promise<TrashItem[]>
  trash(key: string, path: string, expected?: string): Promise<void>
  restoreTrash(key: string, id: string): Promise<string>
  deleteTrash(key: string, id: string): Promise<void>
}

export const native = isTauri()

const desktop: Storage = {
  workspace: () => invoke('get_workspace'),
  openFolder: () => invoke('open_workspace'),
  list: (key) => invoke('list_notes', { key }),
  read: (key, path) => invoke('read_note', { key, path }),
  write: (key, path, text, expected) => invoke('write_note', { key, path, text, expected }),
  loadDrafts: (key) => invoke('load_drafts', { key }),
  saveDraft: (key, draft) => invoke('save_draft', { key, draft }),
  clearDraft: (key, path, through) => invoke('clear_draft', { key, path, through }),
  saveImage: (key, bytes) => invoke('save_image', { key, encoded: base64Image(bytes) }),
  readImage: async (key, path) => {
    const bytes = await invoke<ArrayBuffer | number[]>('read_image', { key, path })
    return Array.isArray(bytes) ? Uint8Array.from(bytes).buffer : bytes
  },
  create: (key) => invoke('create_note', { key }),
  createNamed: (key, path, text, openExisting) => invoke('create_named_note', { key, path, text, openExisting }),
  moveSnapshot: (key) => invoke('move_snapshot', { key }),
  moveNote: (key, plan) => invoke('move_note', { key, plan }),
  listVersions: (key, path) => invoke('list_versions', { key, path }),
  readVersion: (key, path, id) => invoke('read_version', { key, path, id }),
  capture: (text) => invoke('capture_note', { text }),
  listInbox: (key) => invoke('list_inbox', { key }),
  readInbox: (key, { path, local }) => invoke('read_inbox', { key, path, local }),
  processInbox: (key, { path, local }, expected, action) => invoke('process_inbox', { key, path, local, expected, action }),
  undoInbox: (key) => invoke('undo_inbox', { key }),
  listTrash: (key) => invoke('list_trash', { key }),
  trash: (key, path, expected) => invoke('trash_note', { key, path, expected }),
  restoreTrash: (key, id) => invoke('restore_note', { key, id }),
  deleteTrash: (key, id) => invoke('delete_trashed_note', { key, id }),
}

export const showCapture = () => invoke<void>('open_capture')
export const hideCapture = () => invoke<void>('hide_capture')
export const quitFolio = () => invoke<void>('quit_folio')
export const getCaptureShortcut = () => invoke<CaptureShortcut>('capture_shortcut')
export const setCaptureShortcut = (shortcut: string) => invoke<CaptureShortcut>('set_capture_shortcut', { shortcut })

export async function getStorage(): Promise<Storage> {
  return native ? desktop : (await import('./demo-storage.ts')).demoStorage()
}
