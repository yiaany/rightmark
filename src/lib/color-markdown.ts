import { isEditorColor, type EditorColor } from './editor-palette.ts'

export const colorSpecs = [
  { name: 'textColor', tag: 'span', attr: 'data-folio-color' },
  { name: 'highlight', tag: 'mark', attr: 'data-folio-highlight' },
] as const

type ColorSpec = (typeof colorSpecs)[number]

export function readColorOpening(spec: ColorSpec, source: string) {
  const match = new RegExp(`^<${spec.tag} ${spec.attr}="([a-z]+)">`).exec(source)
  return match && isEditorColor(match[1]) ? { raw: match[0], color: match[1] } : undefined
}

export function colorMarkup(spec: ColorSpec, color: EditorColor, content: string) {
  return `<${spec.tag} ${spec.attr}="${color}">${content}</${spec.tag}>`
}

// Inline annotations carry a palette key, never arbitrary CSS or attributes.
export function isColorTag(text: string) {
  return colorSpecs.some((spec) => text === `</${spec.tag}>` || readColorOpening(spec, text)?.raw === text)
}

export function readColorSpan(spec: ColorSpec, source: string) {
  const opening = readColorOpening(spec, source)
  if (!opening) return
  const tokens = new RegExp(`\\\\[\\s\\S]|\`+|</${spec.tag}>|<${spec.tag} `, 'g')
  tokens.lastIndex = opening.raw.length
  let depth = 1
  let token
  while ((token = tokens.exec(source))) {
    if (token[0].startsWith('`')) {
      const code = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/.exec(source.slice(token.index))
      if (code) tokens.lastIndex = token.index + code[0].length
    } else if (token[0].startsWith('</')) {
      if (--depth === 0) return { raw: source.slice(0, tokens.lastIndex), inner: source.slice(opening.raw.length, token.index), color: opening.color }
    } else if (token[0].startsWith('<') && readColorOpening(spec, source.slice(token.index))) {
      depth++
    }
  }
}
