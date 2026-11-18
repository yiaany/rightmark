<script lang="ts">
  import { FolderOpen, Palette } from '@lucide/svelte'
  import ThemeOptions from './ThemeOptions.svelte'
  import type { Theme } from '../lib/appearance.ts'
  import type { Workspace } from '../lib/workspace.svelte.ts'

  let { workspace, theme, onTheme }: { workspace: Workspace; theme: Theme; onTheme: (theme: Theme) => void } = $props()
</script>

<section class="settings-scroll" aria-labelledby="settings-title">
  <div class="settings-content">
    <h1 id="settings-title">Settings</h1>
    <div class="settings-list">
      <div class="setting-row">
        <div class="setting-label"><Palette size={17} strokeWidth={1.55} /><div><h2>Appearance</h2><p>Choose a theme for Folio.</p></div></div>
        <ThemeOptions {theme} onChange={onTheme} />
      </div>
      <div class="setting-row">
        <div class="setting-label"><FolderOpen size={17} strokeWidth={1.55} /><div><h2>Workspace folder</h2><p data-tooltip={workspace.info?.name}>{workspace.info?.name ?? 'No folder open'}</p></div></div>
        <button class="button secondary" type="button" disabled={workspace.busy} onclick={() => void workspace.chooseFolder()}>Change folder</button>
      </div>
    </div>
  </div>
</section>
