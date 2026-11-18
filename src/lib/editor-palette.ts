export const editorPalette = [
  { id: 'grey', label: 'Grey' },
  { id: 'amber', label: 'Yellow' },
  { id: 'clay', label: 'Amber' },
  { id: 'red', label: 'Red' },
  { id: 'rose', label: 'Pink' },
  { id: 'lilac', label: 'Purple' },
  { id: 'navy', label: 'Blue' },
  { id: 'slate', label: 'Sky' },
  { id: 'teal', label: 'Teal' },
  { id: 'sage', label: 'Green' },
] as const

export type EditorColor = (typeof editorPalette)[number]['id']

export function isEditorColor(value: unknown): value is EditorColor {
  return editorPalette.some(({ id }) => id === value)
}
