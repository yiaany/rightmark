<script lang="ts">
  // Sun/moon mask and radial reveal inspired by Kokonut UI Switch Button
  // by Dorian Baffier, MIT (https://kokonutui.com).
  import { flushSync } from 'svelte'

  let { dark, change }: { dark: boolean; change: (theme: 'light' | 'dark') => void } = $props()
  let transition: ViewTransition | undefined
  let requested: 'dark' | 'light' | undefined
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined
  let animateIcon = $state(false)
  const maskId = 'folio-theme-moon'
  const rays = Array.from({ length: 8 }, (_, index) => index * 45)

  function toggle(event: MouseEvent) {
    const root = document.documentElement
    const next = (requested ?? root.dataset.theme) === 'dark' ? 'light' : 'dark'
    const animate = event.detail > 0 && root.dataset.themeMotion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches
    const apply = () => flushSync(() => { requested = undefined; animateIcon = animate; change(next) })
    const fallback = () => {
      root.setAttribute('data-theme-fade', '')
      apply()
      fallbackTimer = setTimeout(() => root.removeAttribute('data-theme-fade'), 420)
    }
    clearTimeout(fallbackTimer)
    if (!animate) root.removeAttribute('data-theme-fade')

    if (transition) {
      transition.skipTransition()
      transition = undefined
      root.removeAttribute('data-theme-reveal')
      apply()
      return
    }
    if (!animate) { apply(); return }
    if (typeof document.startViewTransition !== 'function') { fallback(); return }

    const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect()
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
    const radius = Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)))
    root.style.setProperty('--reveal-origin', `${x}px ${y}px`)
    root.style.setProperty('--reveal-radius', `${radius}px`)
    root.setAttribute('data-theme-reveal', '')
    try {
      requested = next
      const active = document.startViewTransition(() => { if (transition === active) apply() })
      transition = active
      void active.ready.catch(() => {})
      void active.finished.catch(() => {}).finally(() => {
        if (transition !== active) return
        transition = undefined
        requested = undefined
        root.removeAttribute('data-theme-reveal')
      })
    } catch {
      root.removeAttribute('data-theme-reveal')
      fallback()
    }
  }
</script>

<button class="icon-button theme-switch" class:dark class:animate-icon={animateIcon} type="button" aria-label="Dark theme" aria-pressed={dark} data-tooltip={dark ? 'Switch to light theme' : 'Switch to dark theme'} onclick={toggle}>
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
    <mask id={maskId}>
      <rect width="24" height="24" fill="white" />
      <circle class="theme-cutout" cx="17" cy="7" r="7.5" fill="black" />
    </mask>
    <g mask={`url(#${maskId})`}><circle class="theme-disc" cx="12" cy="12" r="4.75" fill="currentColor" /></g>
    <g class="theme-rays" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      {#each rays as angle (angle)}<path d="M12 2v2.5" transform={`rotate(${angle} 12 12)`} />{/each}
    </g>
  </svg>
</button>
