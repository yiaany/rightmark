const selector = '[data-tooltip]'
const delay = 420
const inset = 8

export function mountTooltips(doc: Document) {
  const tip = doc.createElement('div')
  tip.className = 'app-tooltip'
  tip.id = 'folio-tooltip'
  tip.setAttribute('role', 'tooltip')
  tip.hidden = true
  let anchor: HTMLElement | undefined
  let timer: number | undefined
  let warmUntil = 0
  let description: string | null = null
  let addedDescription = false
  const win = doc.defaultView!

  function hide() {
    win.clearTimeout(timer)
    if (anchor && addedDescription) {
      if (description === null) anchor.removeAttribute('aria-describedby')
      else anchor.setAttribute('aria-describedby', description)
    }
    if (!tip.hidden) warmUntil = Date.now() + 230
    tip.remove()
    tip.hidden = true
    anchor = undefined
    addedDescription = false
  }

  function schedule(next: HTMLElement, keyboard = false) {
    if (next === anchor) return
    hide()
    anchor = next
    timer = win.setTimeout(() => {
      const text = next.dataset.tooltip
      if (!next.isConnected || !text || next.closest('[inert]')) { hide(); return }
      tip.textContent = text
      if (next.dataset.tooltipKey) {
        const key = doc.createElement('kbd')
        key.textContent = next.dataset.tooltipKey
        tip.append(key)
      }
      const container = next.closest('dialog[open]') ?? doc.body
      container.append(tip)
      tip.hidden = false
      const rect = next.getBoundingClientRect()
      const width = tip.offsetWidth, height = tip.offsetHeight
      if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > win.innerHeight) { hide(); return }
      const x = Math.max(inset, Math.min(rect.left + (rect.width - width) / 2, win.innerWidth - width - inset))
      const above = rect.top - height - 7
      const below = rect.bottom + 7
      const top = next.closest('.titlebar') || above < inset ? below : above
      tip.style.left = `${Math.round(x)}px`
      tip.style.top = `${Math.round(Math.max(inset, Math.min(top, win.innerHeight - height - inset)))}px`
      if (keyboard && (next.dataset.tooltipKey || text !== next.getAttribute('aria-label'))) {
        description = next.getAttribute('aria-describedby')
        next.setAttribute('aria-describedby', [description, tip.id].filter(Boolean).join(' '))
        addedDescription = true
      }
    }, keyboard || Date.now() < warmUntil ? 0 : delay)
  }

  const origin = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>(selector) : null
  function over(event: PointerEvent) {
    if (event.pointerType === 'touch' || event.buttons) return
    const next = origin(event.target)
    if (next) schedule(next)
  }
  function out(event: PointerEvent) {
    if (origin(event.target) === anchor && origin(event.relatedTarget) !== anchor) hide()
  }
  function focus(event: FocusEvent) {
    const next = origin(event.target)
    if (next?.matches(':focus-visible')) schedule(next, true)
  }
  function dismissOnEsc(event: KeyboardEvent) { if (event.key === 'Escape') hide() }
  doc.addEventListener('pointerover', over)
  doc.addEventListener('pointerout', out)
  doc.addEventListener('pointerdown', hide, true)
  doc.addEventListener('focusin', focus)
  doc.addEventListener('focusout', hide)
  doc.addEventListener('scroll', hide, true)
  doc.addEventListener('keydown', dismissOnEsc)
  win.addEventListener('blur', hide)
  win.addEventListener('resize', hide)
}
