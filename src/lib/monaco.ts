import * as monaco from 'monaco-editor/editor/editor.api.js'
import 'monaco-editor/languages/definitions/markdown/register.js'
import 'monaco-editor/editor/contrib/find/browser/findController.js'
import Worker from 'monaco-editor/editor/editor.worker.js?worker'
import type { editor } from 'monaco-editor'

Object.assign(globalThis, { MonacoEnvironment: { getWorker: () => new Worker() } })

function applyEditorTheme() {
  const root = document.documentElement
  const styles = getComputedStyle(root)
  const token = (name: string) => styles.getPropertyValue(`--${name}`).trim()
  const ink = token('ink'), accent = token('accent')
  monaco.editor.defineTheme('folio', {
    base: root.dataset.theme === 'light' ? 'vs' : 'vs-dark', inherit: true,
    rules: [
      { token: 'keyword', foreground: ink.slice(1), fontStyle: 'bold' },
      { token: 'string.link', foreground: accent.slice(1) },
      { token: 'strong', foreground: ink.slice(1), fontStyle: 'bold' },
    ],
    colors: {
      'editor.background': token('document-canvas'), 'editor.foreground': token('body'), 'editorLineNumber.foreground': token('muted'),
      'editorLineNumber.activeForeground': ink, 'editor.lineHighlightBackground': token('surface'),
      'editor.selectionBackground': token('selection'), 'editorCursor.foreground': accent,
      'editorIndentGuide.background1': token('line'), 'editorWidget.background': token('surface'),
      'editorWidget.border': token('edge'), 'focusBorder': accent,
    },
  })
}

export function mountMonaco(host: HTMLElement, text: string, state: editor.ICodeEditorViewState | null, onChange: (text: string) => void) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  applyEditorTheme()
  const instance: editor.IStandaloneCodeEditor = monaco.editor.create(host, {
    value: text, language: 'markdown', theme: 'folio', automaticLayout: true,
    ariaLabel: 'Markdown source', minimap: { enabled: false }, glyphMargin: false, folding: false,
    lineNumbersMinChars: 3, lineDecorationsWidth: 14, padding: { top: 20, bottom: 32 },
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, lineHeight: 23,
    cursorSmoothCaretAnimation: reduced.matches ? 'off' : 'on',
    cursorBlinking: 'solid', smoothScrolling: !reduced.matches, wordWrap: 'on', scrollBeyondLastLine: false,
    renderWhitespace: 'none', overviewRulerLanes: 0, stickyScroll: { enabled: false },
    links: false, quickSuggestions: false, wordBasedSuggestions: 'off',
    unicodeHighlight: { nonBasicASCII: false, ambiguousCharacters: false },
  })
  const model = instance.getModel()
  // Monaco normalizes mixed line endings; retain the original until the first edit.
  if (state) instance.restoreViewState(state)
  const changes = instance.onDidChangeModelContent(() => onChange(model?.getValue() ?? ''))
  const appearance = new MutationObserver(applyEditorTheme)
  appearance.observe(document.documentElement, { attributeFilter: ['data-theme'] })
  const motion = () => instance.updateOptions({ cursorSmoothCaretAnimation: reduced.matches ? 'off' : 'on', smoothScrolling: !reduced.matches })
  reduced.addEventListener('change', motion)
  return {
    instance,
    destroy() {
      appearance.disconnect()
      reduced.removeEventListener('change', motion)
      changes.dispose()
      instance.dispose()
    },
  }
}
