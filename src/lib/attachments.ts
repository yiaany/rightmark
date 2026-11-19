import { noteFolder } from './notes.ts'

export const imageTypes = 'image/png,image/jpeg,image/gif,image/webp,image/avif'
export const maxImageBytes = 16 * 1024 * 1024
export function base64Image(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binary)
}
export function imageFormat(bytes: Uint8Array): string | undefined {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
  if (text(0, 8) === '\x89PNG\r\n\x1a\n') return 'png'
  if (text(0, 3) === '\xff\xd8\xff') return 'jpg'
  if (['GIF87a', 'GIF89a'].includes(text(0, 6))) return 'gif'
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'webp'
  if (text(4, 8) === 'ftyp' && ['avif', 'avis'].includes(text(8, 12))) return 'avif'
}

export function localImagePath(src: string) {
  if (!src || /^[\w+.-]+:|^\/\//.test(src)) return
  try {
    const value = decodeURIComponent(src)
    if (/[:\\\u0000-\u001f?#]/.test(value) || value.startsWith('//') || !/\.(?:png|jpe?g|gif|webp|avif)$/i.test(value)) return
    return value
  } catch { /* Invalid URI. */ }
}

export function workspaceImage(src: string, from: string) {
  const value = localImagePath(src)
  if (!value) return
  const path = value.startsWith('/') ? [] : noteFolder(from).split('/').filter(Boolean)
  for (const part of value.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') { if (!path.length) return; path.pop() }
    else if (part.startsWith('.')) return
    else path.push(part)
  }
  return path.join('/')
}

export function relativeWorkspacePath(from: string, path: string) {
  const base = noteFolder(from).split('/').filter(Boolean), target = path.split('/')
  while (base.length && target.length > 1 && base[0] === target[0]) { base.shift(); target.shift() }
  return '../'.repeat(base.length) + target.map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)).join('/')
}
export const linkedAttachment = relativeWorkspacePath

export type ImageInsert = { src: string; alt: string }
export const markdownImage = ({ src, alt }: ImageInsert) => `![${alt.replace(/[\\\[\]]/g, '\\$&')}](${src})`

export function transferredImages(data: DataTransfer | null) {
  const files = [...(data?.files ?? [])]
  if (!files.length) for (const item of data?.items ?? []) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile(); if (file) files.push(file)
  }
  return files.filter((file) => file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif)$/i.test(file.name))
}

// Replace only the display URL, never the Markdown source or the editor document.
export function hydrateImages(root: HTMLElement, path: string, read: (path: string) => Promise<ArrayBuffer>) {
  const urls = new Map<string, string>(), loading = new Set<string>(), failed = new Set<string>(), originals = new WeakMap<HTMLImageElement, string>()
  let closed = false
  function refresh() {
    const elements = root instanceof HTMLImageElement ? [root] : [...root.querySelectorAll<HTMLImageElement>('img[src], img[data-local-image]')]
    for (const img of elements) {
      const src = img.dataset.localImage ?? img.getAttribute('src') ?? ''
      if (originals.get(img) === src && img.getAttribute('src')?.startsWith('blob:')) continue
      const relative = workspaceImage(src, path)
      if (!relative) continue
      originals.set(img, src)
      const url = urls.get(relative)
      if (url) { if (img.getAttribute('src') !== url) img.src = url; continue }
      if (img.hasAttribute('src')) img.removeAttribute('src')
      img.dataset.localImage = src
      if (loading.has(relative) || failed.has(relative)) continue
      loading.add(relative)
      void read(relative).then((bytes) => {
        const ext = imageFormat(new Uint8Array(bytes))
        if (closed) return
        if (!ext) { failed.add(relative); return }
        urls.set(relative, URL.createObjectURL(new Blob([bytes], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` })))
        refresh()
      }).catch(() => { failed.add(relative) }).finally(() => { loading.delete(relative) })
    }
  }
  const observer = new MutationObserver(refresh)
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
  refresh()
  return () => { closed = true; observer.disconnect(); for (const url of urls.values()) URL.revokeObjectURL(url) }
}
