<script lang="ts">
  import { onMount } from 'svelte'
  import CaptureEditor from './CaptureEditor.svelte'
  import { getStorage, hideCapture } from '../lib/storage.ts'
  import { effectiveTheme, readTheme } from '../lib/appearance.ts'

  let destination = $state('Inbox')

  onMount(() => {
    const system = matchMedia('(prefers-color-scheme: dark)')
    const theme = () => { document.documentElement.dataset.theme = effectiveTheme(readTheme(), system.matches) }
    function refresh() {
      theme()
      void getStorage().then((storage) => storage.workspace()).then((info) => {
        destination = info.sample ? 'Local Inbox' : `${info.name} / Inbox`
      }).catch(() => { destination = 'Inbox' })
    }
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', theme)
    system.addEventListener('change', theme)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', theme)
      system.removeEventListener('change', theme)
    }
  })
</script>

<CaptureEditor standalone {destination} dismiss={hideCapture} onSaved={() => {}} />
