<script lang="ts">
  import { onMount } from 'svelte'
  import CaptureEditor from './CaptureEditor.svelte'
  import { hideCapture } from '../lib/storage.ts'
  import { effectiveTheme, readTheme } from '../lib/appearance.ts'

  onMount(() => {
    const system = matchMedia('(prefers-color-scheme: dark)')
    const theme = () => { document.documentElement.dataset.theme = effectiveTheme(readTheme(), system.matches) }
    theme()
    window.addEventListener('focus', theme)
    window.addEventListener('storage', theme)
    system.addEventListener('change', theme)
    return () => {
      window.removeEventListener('focus', theme)
      window.removeEventListener('storage', theme)
      system.removeEventListener('change', theme)
    }
  })
</script>

<CaptureEditor standalone dismiss={hideCapture} onSaved={() => {}} />
