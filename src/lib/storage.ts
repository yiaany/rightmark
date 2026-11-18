import { invoke, isTauri } from '@tauri-apps/api/core'
import type { Note } from './notes.ts'
import type { CaptureShortcut, InboxAction, InboxNote } from './inbox.ts'

export type WorkspaceInfo = { key: string; name: string; sample: boolean }

export interface Storage {
  workspace(): Promise<WorkspaceInfo>
  openFolder(): Promise<WorkspaceInfo | null>
  list(key: string): Promise<Note[]>
  read(key: string, path: string): Promise<string>
  write(key: string, path: string, text: string, expected: string): Promise<void>
  create(key: string): Promise<Note>
  capture(text: string): Promise<void>
  listInbox(key: string): Promise<InboxNote[]>
  readInbox(key: string, note: InboxNote): Promise<string>
  processInbox(key: string, note: InboxNote, expected: string, action: InboxAction): Promise<string>
  undoInbox(key: string): Promise<string>
}

export const native = isTauri()

const desktop: Storage = {
  workspace: () => invoke('get_workspace'),
  openFolder: () => invoke('open_workspace'),
  list: (key) => invoke('list_notes', { key }),
  read: (key, path) => invoke('read_note', { key, path }),
  write: (key, path, text, expected) => invoke('write_note', { key, path, text, expected }),
  create: (key) => invoke('create_note', { key }),
  capture: (text) => invoke('capture_note', { text }),
  listInbox: (key) => invoke('list_inbox', { key }),
  readInbox: (key, { path, local }) => invoke('read_inbox', { key, path, local }),
  processInbox: (key, { path, local }, expected, action) => invoke('process_inbox', { key, path, local, expected, action }),
  undoInbox: (key) => invoke('undo_inbox', { key }),
}

export const showCapture = () => invoke<void>('open_capture')
export const hideCapture = () => invoke<void>('hide_capture')
export const quitFolio = () => invoke<void>('quit_folio')
export const getCaptureShortcut = () => invoke<CaptureShortcut>('capture_shortcut')
export const setCaptureShortcut = (shortcut: string) => invoke<CaptureShortcut>('set_capture_shortcut', { shortcut })

export async function getStorage(): Promise<Storage> {
  return native ? desktop : (await import('./demo-storage.ts')).demoStorage()
}
