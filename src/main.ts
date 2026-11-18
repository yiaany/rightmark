import { mount } from 'svelte'
import App from './App.svelte'
import './styles.css'
import { effectiveTheme, readTheme } from './lib/appearance.ts'
import { mountTooltips } from './lib/tooltips.ts'

const initialTheme = readTheme()
document.documentElement.dataset.theme = effectiveTheme(initialTheme, matchMedia('(prefers-color-scheme: dark)').matches)
mountTooltips(document)
mount(App, { target: document.getElementById('app')!, props: { initialTheme } })
