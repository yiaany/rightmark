export type Theme = 'dark' | 'light' | 'system'

const storageKey = 'folio:appearance:v1'
const captureButtonKey = 'rightmark:titlebar-capture:v1'

export function parseTheme(value: string | null): Theme {
  return value === 'light' || value === 'system' ? value : 'dark'
}

export function readTheme(): Theme {
  try { return parseTheme(localStorage.getItem(storageKey)) } catch { return 'dark' }
}

export function saveTheme(theme: Theme) {
  try { localStorage.setItem(storageKey, theme) } catch { /* The current choice still applies. */ }
}

export function effectiveTheme(theme: Theme, systemDark: boolean) {
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
}

export function readCaptureButton(): boolean {
  try { return localStorage.getItem(captureButtonKey) === 'on' } catch { return false }
}

export function saveCaptureButton(visible: boolean) {
  try { localStorage.setItem(captureButtonKey, visible ? 'on' : 'off') } catch { /* The current choice still applies. */ }
}
