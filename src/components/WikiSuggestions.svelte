<script lang="ts">
  import { FileText, Plus } from '@lucide/svelte'
  import { noteFolder, noteName } from '../lib/notes.ts'
  import type { WikiPicker } from '../lib/wiki-picker.svelte.ts'

  let { picker }: { picker: WikiPicker } = $props()
  let innerWidth = $state(0), innerHeight = $state(0)
  let width = $derived(Math.min(340, innerWidth - 24))
  const height = 285
</script>

<svelte:window bind:innerWidth bind:innerHeight />
{#if picker.range && picker.anchor}
  {@const below = innerHeight - picker.anchor.bottom - 17}
  {@const above = below < height && picker.anchor.top - 56 > below}
  <div class="slash-menu wiki-menu" class:above id="wiki-suggestions" role="listbox" aria-label="Link to note" aria-busy={picker.busy}
    style:left="{Math.max(12, Math.min(picker.anchor.left, innerWidth - width - 12))}px" style:top="{above ? picker.anchor.top - 6 : picker.anchor.bottom + 6}px" style:width="{width}px"
    style:max-height="{Math.max(0, Math.min(height, above ? picker.anchor.top - 56 : below))}px">
    <div class="slash-section" aria-hidden="true">Link to note</div>
    {#each picker.choices as choice, index (choice.id)}
      <button type="button" role="option" tabindex="-1" id={`wiki-option-${index}`} aria-selected={Math.min(picker.active, picker.choices.length - 1) === index}
        onmousedown={(event) => event.preventDefault()} onpointermove={() => { picker.active = index }} onclick={() => void picker.choose(index)}>
        {#if choice.create}<Plus size={16} strokeWidth={1.6} />{:else}<FileText size={16} strokeWidth={1.6} />{/if}
        <span><strong>{choice.create ? `Create “${noteName(choice.path)}”` : noteName(choice.path)}</strong><small>{noteFolder(choice.path) || 'Workspace'}</small></span>
      </button>
    {:else}<p>No matching notes</p>{/each}
    {#if picker.error}<p class="wiki-error" role="alert">{picker.error}</p>{/if}
  </div>
{/if}
