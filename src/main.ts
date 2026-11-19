import { mount } from 'svelte'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { native } from './lib/storage.ts'
import './styles.css'
import { effectiveTheme, readTheme } from './lib/appearance.ts'
import { mountTooltips } from './lib/tooltips.ts'
import { applyEditorPreferences, readEditorPreferences } from './lib/editor-preferences.ts'

const initialTheme = readTheme()
document.documentElement.dataset.theme = effectiveTheme(initialTheme, matchMedia('(prefers-color-scheme: dark)').matches)
applyEditorPreferences(readEditorPreferences())
mountTooltips(document)
const target = document.getElementById('app')!
if (native && getCurrentWindow().label === 'capture') {
  document.documentElement.classList.add('capture-window')
  void import('./components/CaptureWindow.svelte').then(({ default: CaptureWindow }) => mount(CaptureWindow, { target }))
} else {
  void import('./App.svelte').then(({ default: App }) => mount(App, { target, props: { initialTheme } }))
}
