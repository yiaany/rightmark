import * as monaco from 'monaco-editor/editor/editor.api.js'
import 'monaco-editor/languages/definitions/markdown/register.js'
import 'monaco-editor/editor/contrib/find/browser/findController.js'
import Worker from 'monaco-editor/editor/editor.worker.js?worker'
import type { editor } from 'monaco-editor'

export const contentTextTarget = monaco.editor.MouseTargetType.CONTENT_TEXT

Object.assign(globalThis, { MonacoEnvironment: { getWorker: () => new Worker() } })

function applyEditorTheme() {
  const root = document.documentElement
  const styles = getComputedStyle(root)
  const token = (name: string) => styles.getPropertyValue(`--${name}`).trim()
  const tokenRule = (value: string) => value.replace(/^#/, '').replace(/^([a-f\d])([a-f\d])([a-f\d])$/i, '$1$1$2$2$3$3')
  const ink = token('ink'), accent = token('accent')
  monaco.editor.defineTheme('folio', {
    base: root.dataset.theme === 'light' ? 'vs' : 'vs-dark', inherit: true,
    rules: [
      { token: 'keyword', foreground: tokenRule(ink), fontStyle: 'bold' },
      { token: 'string.link', foreground: tokenRule(token('link')) },
      { token: 'strong', foreground: tokenRule(ink), fontStyle: 'bold' },
    ],
    colors: {
      'editor.background': token('document-canvas'), 'editor.foreground': token('body'), 'editorLineNumber.foreground': token('muted'),
      'editorLineNumber.activeForeground': ink, 'editor.lineHighlightBackground': token('surface'),
      'editor.selectionBackground': token('selection'), 'editorCursor.foreground': accent,
      'editorIndentGuide.background1': token('line'), 'editorWidget.background': token('overlay'),
      'editorWidget.border': token('edge'), 'focusBorder': token('focus'),
    },
  })
}

export function mountMonaco(host: HTMLElement, text: string, state: editor.ICodeEditorViewState | null, onChange: (text: string) => void) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const cursorBlinking = () => document.documentElement.dataset.caretBlink === 'off' ? 'solid' as const : 'blink' as const
  applyEditorTheme()
  const instance: editor.IStandaloneCodeEditor = monaco.editor.create(host, {
    value: text, language: 'markdown', theme: 'folio', automaticLayout: true,
    ariaLabel: 'Markdown source', minimap: { enabled: false }, glyphMargin: false, folding: false,
    lineNumbersMinChars: 3, lineDecorationsWidth: 14, padding: { top: 20, bottom: 32 },
    fontFamily: `ui-monospace, SFMono-Regular, Menlo, ${getComputedStyle(document.documentElement).getPropertyValue('--emoji-font').trim()}, monospace`, fontSize: 13, lineHeight: 23,
    cursorSmoothCaretAnimation: reduced.matches ? 'off' : 'on',
    cursorBlinking: cursorBlinking(), smoothScrolling: !reduced.matches, wordWrap: 'on', scrollBeyondLastLine: false,
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
  const caret = new MutationObserver(() => instance.updateOptions({ cursorBlinking: cursorBlinking() }))
  caret.observe(document.documentElement, { attributeFilter: ['data-caret-blink'] })
  const motion = () => instance.updateOptions({ cursorSmoothCaretAnimation: reduced.matches ? 'off' : 'on', smoothScrolling: !reduced.matches })
  reduced.addEventListener('change', motion)
  return {
    instance,
    destroy() {
      appearance.disconnect()
      caret.disconnect()
      reduced.removeEventListener('change', motion)
      changes.dispose()
      instance.dispose()
    },
  }
}
