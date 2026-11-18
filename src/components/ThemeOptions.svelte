<script lang="ts">
  import { Monitor, Moon, Sun } from '@lucide/svelte'
  import type { Theme } from '../lib/appearance.ts'

  let { theme, onChange, compact = false }: { theme: Theme; onChange: (theme: Theme) => void; compact?: boolean } = $props()
  const choices = [
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'system', label: 'System', icon: Monitor },
  ] as const
</script>

<div class="theme-options" class:compact role="group" aria-label="Appearance">
  {#each choices as choice (choice.value)}
    <button type="button" aria-pressed={theme === choice.value} onclick={() => onChange(choice.value)}>
      <choice.icon size={15} strokeWidth={1.6} /><span>{choice.label}</span>
    </button>
  {/each}
</div>
