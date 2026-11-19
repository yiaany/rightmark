<script lang="ts">
  import { onMount } from 'svelte'
  import { X } from '@lucide/svelte'
  import { getStorage } from '../lib/storage.ts'
  import { primaryShortcutLabel } from '../lib/shortcuts.ts'

  let { dismiss, onSaved, standalone = false }: {
    dismiss: () => void | Promise<void>; onSaved: () => void; standalone?: boolean
  } = $props()
  const draftKey = 'folio:quick-capture-draft:v1'
  function loadDraft() { try { return localStorage.getItem(draftKey) ?? '' } catch { return '' } }
  let draft = $state(loadDraft())
  let pending = $state(false)
  let error = $state('')
  let field: HTMLTextAreaElement

  onMount(() => { field.focus() })

  function persist(next: string) {
    draft = next
    try { if (next) localStorage.setItem(draftKey, next); else localStorage.removeItem(draftKey) } catch { /* The text remains in the open window. */ }
  }

  async function save(event?: SubmitEvent) {
    event?.preventDefault()
    if (!draft.trim() || pending) return
    pending = true
    error = ''
    try { await (await getStorage()).capture(draft) }
    catch (cause) { error = String(cause); pending = false; field.focus(); return }
    persist('')
    pending = false
    onSaved()
    try { await dismiss() } catch (cause) { error = String(cause) }
  }

  function keys(event: KeyboardEvent) {
    if (event.isComposing) return
    if (event.key === 'Escape') { event.preventDefault(); if (!pending) void dismiss() }
    else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void save() }
  }
</script>

<svelte:window onkeydown={keys} onfocus={() => { if (standalone && !pending) field?.focus() }} />

<form class="capture-editor" class:standalone onsubmit={save} aria-label="Quick Capture">
  <header data-tauri-drag-region={standalone ? '' : undefined}>
    <h1 data-tauri-drag-region={standalone ? '' : undefined}>Quick Capture</h1>
    <button type="button" class="icon-button" aria-label="Hide Quick Capture" disabled={pending} onclick={() => void dismiss()}><X size={17} /></button>
  </header>
  <textarea bind:this={field} aria-label="Quick note" placeholder="Write it down…" value={draft} readonly={pending} oninput={(event) => persist(event.currentTarget.value)}></textarea>
  {#if error}<p class="capture-error" role="alert">{error}</p>{/if}
  <footer>
    <button type="submit" class="button primary comfortable" disabled={!draft.trim() || pending}>{pending ? 'Saving…' : 'Save'} <kbd class="keycap" aria-hidden="true">{primaryShortcutLabel('Enter')}</kbd></button>
  </footer>
</form>
