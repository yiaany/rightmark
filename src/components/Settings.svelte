<script lang="ts">
  import { FolderOpen, Keyboard, Palette } from '@lucide/svelte'
  import ThemeOptions from './ThemeOptions.svelte'
  import type { Theme } from '../lib/appearance.ts'
  import type { Workspace } from '../lib/workspace.svelte.ts'
  import { native } from '../lib/storage.ts'
  import { shortcutFrom, shortcutLabel, type CaptureShortcut } from '../lib/inbox.ts'

  let { workspace, theme, onTheme, shortcut, changeShortcut }: { workspace: Workspace; theme: Theme; onTheme: (theme: Theme) => void; shortcut: CaptureShortcut; changeShortcut: (value: string) => Promise<void> } = $props()
  let recording = $state(false)
  let saving = $state(false)
  let error = $state('')

  async function record(event: KeyboardEvent) {
    if (!recording || event.key === 'Tab') return
    event.preventDefault(); event.stopPropagation()
    if (event.key === 'Escape') { recording = false; error = ''; return }
    const value = shortcutFrom(event)
    if (!value) return
    recording = false; saving = true; error = ''
    try { await changeShortcut(value) }
    catch (cause) { error = String(cause) }
    finally { saving = false }
  }
</script>

<section class="settings-scroll" aria-labelledby="settings-title">
  <div class="settings-content">
    <h1 id="settings-title">Settings</h1>
    <div class="settings-list">
      <div class="setting-row">
        <div class="setting-label"><Palette size={17} strokeWidth={1.55} /><div><h2>Appearance</h2><p>Choose a theme for Folio.</p></div></div>
        <ThemeOptions {theme} onChange={onTheme} />
      </div>
      {#if native}
        <div class="setting-row">
          <div class="setting-label"><Keyboard size={17} strokeWidth={1.55} /><div><h2>Quick Capture shortcut</h2><p>Works while Folio is running in the background.</p></div></div>
          <button type="button" class="button secondary" aria-label="Change Quick Capture shortcut" aria-pressed={recording} disabled={saving} onclick={() => { recording = !recording; error = '' }} onblur={() => { recording = false }} onkeydown={(event) => void record(event)}>
            {#if recording}Press two modifiers + a key…{:else}<kbd>{shortcutLabel(shortcut.shortcut)}</kbd>{/if}
          </button>
          {#if error || shortcut.error}<p class="shortcut-error" role="alert">{error || shortcut.error}</p>{/if}
        </div>
      {/if}
      <div class="setting-row">
        <div class="setting-label"><FolderOpen size={17} strokeWidth={1.55} /><div><h2>Workspace folder</h2><p data-tooltip={workspace.info?.name}>{workspace.info?.name ?? 'No folder open'}</p></div></div>
        <button class="button secondary" type="button" disabled={workspace.busy} onclick={() => void workspace.chooseFolder()}>Change folder</button>
      </div>
    </div>
  </div>
</section>
