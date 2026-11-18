export function normalizeEditorLink(value: string) {
  const input = value.trim()
  if (!input || /[\u0000-\u001f\u007f\\]/.test(input) || input.startsWith('//')) return
  if (!/^[a-z][a-z\d+.-]*:/i.test(input) && /\.m(?:d|arkdown)(?:#|$)/i.test(input)) return encodeURI(input)
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`
  try {
    const url = new URL(candidate)
    if (url.protocol === 'mailto:') return url.pathname.includes('@') ? url.href : undefined
    if (['https:', 'http:'].includes(url.protocol) && url.hostname && !url.username && !url.password) return url.href
  } catch { /* Keep the form open on invalid input. */ }
}
