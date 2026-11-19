export type EditorPreferences = {
  textSize: 'small' | 'default' | 'large'; width: 'narrow' | 'standard' | 'wide'; spacing: 'compact' | 'standard' | 'relaxed';
  defaultView: 'preview' | 'editor' | 'split'; spellcheck: boolean; blink: boolean; themeMotion: boolean;
}
const key = 'rightmark:editor:v1'
export const editorDefaults: EditorPreferences = { textSize: 'default', width: 'standard', spacing: 'standard', defaultView: 'preview', spellcheck: false, blink: true, themeMotion: true }

export function parseEditorPreferences(raw: string | null): EditorPreferences {
  try {
    const value = JSON.parse(raw ?? '{}')
    return { textSize: value.textSize === 'small' || value.textSize === 'large' ? value.textSize : 'default',
      width: value.width === 'narrow' || value.width === 'wide' ? value.width : 'standard',
      spacing: value.spacing === 'compact' || value.spacing === 'relaxed' ? value.spacing : 'standard',
      defaultView: value.defaultView === 'editor' || value.defaultView === 'split' ? value.defaultView : 'preview', spellcheck: value.spellcheck === true,
      blink: value.blink !== false, themeMotion: value.themeMotion !== false }
  } catch { return { ...editorDefaults } }
}

export function readEditorPreferences(): EditorPreferences {
  try { return parseEditorPreferences(localStorage.getItem(key)) } catch { return { ...editorDefaults } }
}

export function applyEditorPreferences(value: EditorPreferences) {
  const root = document.documentElement
  root.dataset.editorSize = value.textSize
  root.dataset.editorWidth = value.width
  root.dataset.editorSpacing = value.spacing
  root.dataset.editorSpellcheck = value.spellcheck ? 'on' : 'off'
  root.dataset.caretBlink = value.blink ? 'on' : 'off'
  root.dataset.themeMotion = value.themeMotion ? 'on' : 'off'
}

export function saveEditorPreferences(value: EditorPreferences) {
  localStorage.setItem(key, JSON.stringify(value))
  applyEditorPreferences(value)
}
