import { mount } from 'svelte'
import App from './App.svelte'
import './styles.css'
import { effectiveTheme, readTheme } from './lib/appearance.ts'

const initialTheme = readTheme()
document.documentElement.dataset.theme = effectiveTheme(initialTheme, matchMedia('(prefers-color-scheme: dark)').matches)
mount(App, { target: document.getElementById('app')!, props: { initialTheme } })
