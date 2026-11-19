<script lang="ts">
  import { FolderOpen, Keyboard, Palette, SlidersHorizontal, SquarePen } from '@lucide/svelte'
  import ThemeOptions from './ThemeOptions.svelte'
  import Dropdown, { type DropdownOption } from './Dropdown.svelte'
  import type { Theme } from '../lib/appearance.ts'
  import type { Workspace } from '../lib/workspace.svelte.ts'
  import { native } from '../lib/storage.ts'
  import { commands, defaults, displayShortcut, keyboardChord, type Bindings, type Command } from '../lib/shortcuts.ts'
  import { editorDefaults, readEditorPreferences, saveEditorPreferences, type EditorPreferences } from '../lib/editor-preferences.ts'

  let { workspace, theme, onTheme, captureButton, setCaptureButton, keys, shortcutError, changeShortcut, resetShortcuts }: {
    workspace: Workspace; theme: Theme; onTheme: (theme: Theme) => void; keys: Bindings; shortcutError: string | null;
    captureButton: boolean; setCaptureButton: (visible: boolean) => void;
    changeShortcut: (id: Command, value: string) => Promise<void>; resetShortcuts: () => Promise<void>
  } = $props()
  const sections = [{ id: 'general', label: 'General', icon: Palette }, { id: 'keys', label: 'Shortcuts', icon: Keyboard }, { id: 'advanced', label: 'Advanced', icon: SlidersHorizontal }] as const
  const groups: { label: string; ids: Command[] }[] = [
    { label: 'Capture and notes', ids: ['capture', 'search', 'newNote', 'template', 'save', 'closeTab'] },
    { label: 'Navigate', ids: ['home', 'today', 'inbox', 'tasks', 'graph', 'trash', 'sidebar', 'settings'] },
    { label: 'Document view', ids: ['source', 'split', 'preview'] },
  ]
  let section = $state<(typeof sections)[number]['id']>('general')
  let prefs = $state(readEditorPreferences())
  let recording = $state<Command>()
  let problem = $state<{ id?: Command; text: string }>()
  let saving = $state(false)
  let filter = $state('')
  let shown = $derived(groups.map(({ label, ids }) => ({ label, ids: ids.filter((id) => (native || id !== 'closeTab') && `${commands[id]} ${displayShortcut(keys[id])}`.toLowerCase().includes(filter.trim().toLowerCase())) })).filter((group) => group.ids.length))
  const writing: { key: 'textSize' | 'width' | 'spacing' | 'defaultView'; label: string; detail: string; options: DropdownOption[] }[] = [
    { key: 'textSize', label: 'Document text size', detail: 'Body text in the visual editor.', options: [{ value: 'small', label: 'Small', detail: '14 px' }, { value: 'default', label: 'Default', detail: '16 px' }, { value: 'large', label: 'Large', detail: '18 px' }] },
    { key: 'width', label: 'Writing width', detail: 'How wide the visual editor’s text column can grow.', options: [{ value: 'narrow', label: 'Narrow' }, { value: 'standard', label: 'Standard' }, { value: 'wide', label: 'Wide' }] },
    { key: 'spacing', label: 'Line spacing', detail: 'Adjust the space between lines as you write.', options: [{ value: 'compact', label: 'Compact' }, { value: 'standard', label: 'Standard' }, { value: 'relaxed', label: 'Relaxed' }] },
    { key: 'defaultView', label: 'Default note view', detail: 'Applies when opening a note in a new tab.', options: [{ value: 'preview', label: 'Preview', detail: 'Visual editing' }, { value: 'editor', label: 'Editor', detail: 'Markdown source' }, { value: 'split', label: 'Split', detail: 'Source and preview' }] },
  ]

  function update(next: Partial<EditorPreferences>) {
    try { const value = { ...prefs, ...next }; saveEditorPreferences(value); prefs = value; problem = undefined }
    catch (error) { problem = { text: String(error) } }
  }

  async function store(id: Command, value: string) {
    if (saving) return
    saving = true; problem = undefined
    try { await changeShortcut(id, value); recording = undefined }
    catch (error) { problem = { id, text: error instanceof Error ? error.message : String(error) } }
    finally { saving = false }
  }

  function record(event: KeyboardEvent, id: Command) {
    if (recording !== id || event.key === 'Tab' || event.isComposing || event.repeat) return
    event.preventDefault(); event.stopPropagation()
    if (event.key === 'Escape') { recording = undefined; problem = undefined; return }
    const chord = keyboardChord(event)
    if (chord) void store(id, chord)
    else if (!['Shift', 'Alt', 'Control', 'Meta'].includes(event.key)) problem = { id, text: 'Hold a modifier, then press a key.' }
  }

  async function reset() {
    if (saving) return
    saving = true; recording = undefined; problem = undefined
    try { await resetShortcuts() } catch (error) { problem = { text: String(error) } }
    finally { saving = false }
  }
</script>

<section class="settings-scroll" aria-labelledby="settings-title">
  <div class="settings-content">
    <h1 id="settings-title">Settings</h1>
    <nav class="page-tabs" aria-label="Settings sections">
      {#each sections as item (item.id)}
        <button type="button" aria-current={section === item.id ? 'true' : undefined} onclick={() => { section = item.id; problem = undefined; recording = undefined }}><item.icon size={16} strokeWidth={1.65} />{item.label}</button>
      {/each}
    </nav>
    {#if section === 'general'}
      <div class="settings-list">
        <div class="setting-row"><div class="setting-label"><Palette size={17} strokeWidth={1.55} /><div><h2>Appearance</h2><p>Choose a theme for rightmark.</p></div></div><ThemeOptions {theme} onChange={onTheme} /></div>
        <label class="setting-row"><span class="setting-label"><SquarePen size={17} strokeWidth={1.55} /><span><strong id="capture-button-setting">Show Quick Capture in title bar</strong><small id="capture-button-help">The shortcut <kbd>{displayShortcut(keys.capture)}</kbd> works either way.</small></span></span><input class="settings-toggle" type="checkbox" aria-labelledby="capture-button-setting" aria-describedby="capture-button-help" checked={captureButton} onchange={(event) => setCaptureButton(event.currentTarget.checked)} /></label>
        <div class="setting-row"><div class="setting-label"><FolderOpen size={17} strokeWidth={1.55} /><div><h2>Workspace folder</h2><p>{workspace.info?.name ?? 'No folder open'}</p></div></div><button class="button secondary" type="button" disabled={workspace.busy} onclick={() => void workspace.chooseFolder()}>Change folder</button></div>
      </div>
    {:else if section === 'keys'}
      <div class="settings-tools"><input class="work-input" type="search" aria-label="Filter shortcuts" placeholder="Find a shortcut…" bind:value={filter} /><button class="button secondary" type="button" disabled={saving} onclick={() => void reset()}>Restore defaults</button></div>
      {#each shown as group (group.label)}
        <section class="shortcut-group" aria-label={group.label}>
          <h2>{group.label}</h2>
          <div class="settings-list">
            {#each group.ids as id (id)}
              <div class="setting-row shortcut-row">
                <div class="setting-label"><div><h3>{commands[id]}</h3>{#if id === 'capture'}<p>{native ? 'Global shortcut' : 'In this window'}</p>{/if}</div></div>
                <div class="shortcut-actions">
                  <button type="button" class="button secondary shortcut-recorder" data-shortcut-recorder aria-label={`Change ${commands[id]} shortcut`} aria-pressed={recording === id} aria-busy={saving && recording === id} onclick={() => { if (!saving) { recording = recording === id ? undefined : id; problem = undefined } }} onkeydown={(event) => record(event, id)} onblur={() => { if (recording === id) recording = undefined }}>
                    {#if recording === id}Press keys…{:else if keys[id]}<kbd>{displayShortcut(keys[id])}</kbd>{:else}Not set{/if}
                  </button>
                  {#if id !== 'capture'}<button type="button" class="button quiet" aria-label={`${keys[id] ? 'Clear' : 'Reset'} ${commands[id]} shortcut`} disabled={saving || (!keys[id] && !defaults[id])} onclick={() => void store(id, keys[id] ? '' : defaults[id])}>{keys[id] ? 'Clear' : 'Reset'}</button>{/if}
                </div>
                {#if problem?.id === id || (id === 'capture' && shortcutError)}<p class="shortcut-error" role="alert">{problem?.id === id ? problem.text : shortcutError}</p>{/if}
              </div>
            {/each}
          </div>
        </section>
      {:else}<p class="subtle-empty">No shortcuts found.</p>{/each}
    {:else}
      <section class="settings-section" aria-labelledby="writing-settings">
        <h2 id="writing-settings">Writing</h2>
        <div class="settings-list">
          {#each writing as field (field.key)}
            <div class="setting-row"><div class="setting-label"><div><h3>{field.label}</h3><p>{field.detail}</p></div></div><Dropdown label={field.label} value={prefs[field.key]} options={field.options} onChange={(value) => update({ [field.key]: value })} /></div>
          {/each}
          <label class="setting-row"><span class="setting-label"><span><strong>Check spelling</strong><small>Underline misspellings in the visual editor.</small></span></span><input class="settings-toggle" type="checkbox" aria-label="Check spelling" checked={prefs.spellcheck} onchange={(event) => update({ spellcheck: event.currentTarget.checked })} /></label>
        </div>
      </section>
      <section class="settings-section" aria-labelledby="motion-settings">
        <h2 id="motion-settings">Motion</h2>
        <div class="settings-list">
          <label class="setting-row"><span class="setting-label"><span><strong>Blinking cursor</strong><small>Blink the cursor while the editor is idle.</small></span></span><input class="settings-toggle" type="checkbox" aria-label="Blinking cursor" checked={prefs.blink} onchange={(event) => update({ blink: event.currentTarget.checked })} /></label>
          <label class="setting-row"><span class="setting-label"><span><strong>Animate theme changes</strong><small>Respects the system Reduce Motion setting.</small></span></span><input class="settings-toggle" type="checkbox" aria-label="Animate theme changes" checked={prefs.themeMotion} onchange={(event) => update({ themeMotion: event.currentTarget.checked })} /></label>
        </div>
      </section>
      <button type="button" class="button quiet" onclick={() => update(editorDefaults)}>Reset advanced preferences</button>
    {/if}
    {#if problem && !problem.id}<p class="shortcut-error" role="alert">{problem.text}</p>{/if}
  </div>
</section>
