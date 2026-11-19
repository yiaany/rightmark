export type SavedView = { mode?: 'preview' | 'editor' | 'split'; scrollTop?: number; richState?: { from: number; to: number }; sourceState?: unknown }
export type SavedSession = { tabs: string[]; active: string; page: string; date: string; views: Record<string, SavedView> }

const keyFor = (key: string) => `rightmark:session:v1:${key}`
const sane = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0
export function parseSession(raw: string | null): SavedSession | undefined {
  try {
    const value = JSON.parse(raw ?? 'null')
    if (!value || !Array.isArray(value.tabs)) return
    const tabs = [...new Set<string>(value.tabs.filter((tab: unknown) => typeof tab === 'string'))].slice(0, 100)
    const views: SavedSession['views'] = Object.create(null)
    if (value.views && typeof value.views === 'object') for (const [path, view] of Object.entries<Partial<SavedView>>(value.views).slice(0, 130)) {
      if (!view || typeof view !== 'object') continue
      views[path] = {
        mode: ['preview', 'editor', 'split'].includes(view.mode ?? '') ? view.mode : undefined,
        scrollTop: sane(view.scrollTop) ? view.scrollTop : undefined,
        richState: sane(view.richState?.from) && sane(view.richState?.to) ? view.richState : undefined,
        sourceState: view.sourceState && typeof view.sourceState === 'object' ? view.sourceState : undefined,
      }
    }
    return { tabs, active: typeof value.active === 'string' ? value.active : '', page: typeof value.page === 'string' ? value.page : 'home', date: typeof value.date === 'string' ? value.date : '', views }
  } catch { /* Malformed or obsolete state is optional. */ }
}

export function readSession(key: string) {
  try { return parseSession(localStorage.getItem(keyFor(key))) } catch { /* Storage unavailable. */ }
}

export function storeSession(key: string, value: SavedSession) {
  try { localStorage.setItem(keyFor(key), JSON.stringify(value)) } catch { /* Optional UI state. */ }
}
