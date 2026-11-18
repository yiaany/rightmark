import { invoke } from '@tauri-apps/api/core'
import { native } from './storage.ts'

export function followLink(event: MouseEvent, follow: (target: string) => void, modifierOnly = false) {
  if (!(event.target instanceof Element)) return
  const anchor = event.target.closest<HTMLAnchorElement>('a')
  if (!anchor) return
  event.preventDefault()
  if (modifierOnly && event.detail !== 0 && !(event.metaKey || event.ctrlKey)) return
  const href = anchor.getAttribute('href') ?? ''
  const wiki = anchor.dataset.wiki
  if (wiki) { follow(wiki); return }
  if (/^(https?:|mailto:)/i.test(href)) {
    if (native) void invoke('plugin:opener|open_url', { url: href }).catch(console.error)
    else window.open(href, '_blank', 'noopener,noreferrer')
  } else if (/\.m(?:d|arkdown)(?:#|$)/i.test(href) && !/[:\\]/.test(href)) {
    try { follow(decodeURI(href)) } catch { /* invalid URL */ }
  }
}
