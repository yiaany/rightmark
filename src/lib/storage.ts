import { invoke, isTauri } from '@tauri-apps/api/core'
import type { Note } from './notes.ts'

export type WorkspaceInfo = { key: string; name: string; sample: boolean }

export interface Storage {
  workspace(): Promise<WorkspaceInfo>
  openFolder(): Promise<WorkspaceInfo | null>
  list(key: string): Promise<Note[]>
  read(key: string, path: string): Promise<string>
  write(key: string, path: string, text: string, expected: string): Promise<void>
  create(key: string): Promise<Note>
}

export const native = isTauri()

const desktop: Storage = {
  workspace: () => invoke('get_workspace'),
  openFolder: () => invoke('open_workspace'),
  list: (key) => invoke('list_notes', { key }),
  read: (key, path) => invoke('read_note', { key, path }),
  write: (key, path, text, expected) => invoke('write_note', { key, path, text, expected }),
  create: (key) => invoke('create_note', { key }),
}

export async function getStorage(): Promise<Storage> {
  return native ? desktop : (await import('./demo-storage.ts')).demoStorage()
}
