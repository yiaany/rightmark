import * as monaco from 'monaco-editor/editor/editor.api.js'
import 'monaco-editor/languages/definitions/markdown/register.js'
import 'monaco-editor/editor/contrib/find/browser/findController.js'
import Worker from 'monaco-editor/editor/editor.worker.js?worker'
import type { editor } from 'monaco-editor'

Object.assign(globalThis, { MonacoEnvironment: { getWorker: () => new Worker() } })

monaco.editor.defineTheme('folio', {
  base: 'vs-dark', inherit: true,
  rules: [
    { token: 'keyword', foreground: '78B7FF' },
    { token: 'string.link', foreground: '78B7FF' },
    { token: 'strong', foreground: 'D7E0EF', fontStyle: 'bold' },
  ],
  colors: {
    'editor.background': '#181818', 'editor.foreground': '#D2D5DA', 'editorLineNumber.foreground': '#797E86',
    'editorLineNumber.activeForeground': '#BBC1CA', 'editor.lineHighlightBackground': '#202124',
    'editor.selectionBackground': '#254877', 'editorCursor.foreground': '#83BBFF',
    'editorIndentGuide.background1': '#313338',
  },
})

export function mountMonaco(host: HTMLElement, text: string, state: editor.ICodeEditorViewState | null, onChange: (text: string) => void) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const instance: editor.IStandaloneCodeEditor = monaco.editor.create(host, {
    value: text, language: 'markdown', theme: 'folio', automaticLayout: true,
    ariaLabel: 'Markdown source', minimap: { enabled: false }, glyphMargin: false, folding: false,
    lineNumbersMinChars: 3, lineDecorationsWidth: 14, padding: { top: 20, bottom: 32 },
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, lineHeight: 23,
    cursorSmoothCaretAnimation: reduced.matches ? 'off' : 'on',
    cursorBlinking: 'solid', wordWrap: 'on', scrollBeyondLastLine: false,
    renderWhitespace: 'none', overviewRulerLanes: 0, stickyScroll: { enabled: false },
    links: false, quickSuggestions: false, wordBasedSuggestions: 'off',
    unicodeHighlight: { nonBasicASCII: false, ambiguousCharacters: false },
  })
  const model = instance.getModel()
  // Monaco normalizes mixed line endings; retain the original until the first edit.
  if (state) instance.restoreViewState(state)
  const changes = instance.onDidChangeModelContent(() => onChange(model?.getValue() ?? ''))
  const motion = () => instance.updateOptions({ cursorSmoothCaretAnimation: reduced.matches ? 'off' : 'on' })
  reduced.addEventListener('change', motion)
  return {
    instance,
    destroy() {
      reduced.removeEventListener('change', motion)
      changes.dispose()
      instance.dispose()
    },
  }
}
