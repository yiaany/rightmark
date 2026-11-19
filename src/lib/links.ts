import { invoke } from '@tauri-apps/api/core'
import { native } from './storage.ts'
import { localMarkdownTarget } from './markdown.ts'

export function followLink(event: MouseEvent, follow: (target: string) => void, modifierOnly = false) {
  if (!(event.target instanceof Element)) return
  const anchor = event.target.closest<HTMLAnchorElement>('a')
  if (!anchor) return
  event.preventDefault()
  const href = anchor.getAttribute('href') ?? ''
  const wiki = anchor.dataset.wiki
  if (wiki) { follow(wiki); return }
  if (/^(https?:|mailto:)/i.test(href)) {
    if (modifierOnly && event.detail !== 0 && !(event.metaKey || event.ctrlKey)) return
    if (native) void invoke('plugin:opener|open_url', { url: href }).catch(console.error)
    else window.open(href, '_blank', 'noopener,noreferrer')
  } else { const target = localMarkdownTarget(href); if (target && target !== '#') follow(target) }
}
