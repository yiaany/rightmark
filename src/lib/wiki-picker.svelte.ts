import { tick } from 'svelte'
import { notePath, wikiChoices } from './note-actions.ts'
import { noteFolder, pathKey, type Note } from './notes.ts'

export type WikiRange = { from: number; to: number; query: string }
export type WikiAnchor = { left: number; top: number; bottom: number }
export type WikiChoice = { id: string; path: string; create?: string }

export class WikiPicker {
  range = $state<WikiRange>()
  anchor = $state<WikiAnchor>()
  active = $state(0)
  busy = $state(false)
  error = $state('')
  private dismissed?: number

  constructor(private notes: () => Note[], private path: () => string, private insert: (choice: WikiChoice, range: WikiRange) => Promise<void>) {}

  choices = $derived.by(() => {
    if (!this.range) return []
    const { query } = this.range, notes = this.notes(), from = this.path()
    const rows: WikiChoice[] = wikiChoices(notes, query, from).map((path) => ({ id: path, path }))
    const title = query.trim()
    if (title) try {
      const path = notePath(title, noteFolder(from))
      if (!notes.some((note) => pathKey(note.path) === pathKey(path))) rows.push({ id: `new:${path}`, path, create: title })
    } catch { /* Folder searches and invalid names cannot create a file. */ }
    return rows
  })

  update(range: WikiRange | undefined, anchor?: WikiAnchor) {
    if (!range || !anchor) { this.dismissed = undefined; this.hide(); return }
    if (this.dismissed === range.from) return
    if (this.range?.from !== range.from || this.range?.query !== range.query) { this.active = 0; this.error = '' }
    this.anchor = anchor
    if (this.range?.from !== range.from || this.range.to !== range.to || this.range.query !== range.query) this.range = range
  }

  hide() { this.range = undefined; this.anchor = undefined; this.error = '' }

  async choose(index: number) {
    const range = this.range, choice = this.choices[index]
    if (!range || !choice || this.busy) return
    this.busy = true
    try { await this.insert(choice, range); this.hide() }
    catch (error) { if (this.range) this.error = error instanceof Error ? error.message : String(error) }
    finally { this.busy = false }
  }

  key(event: KeyboardEvent) {
    if (!this.range || event.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
    if (event.key === 'Escape') { this.dismissed = this.range.from; this.hide() }
    else if (this.choices.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      this.active = (this.active + (event.key === 'ArrowDown' ? 1 : this.choices.length - 1)) % this.choices.length
      void tick().then(() => document.getElementById(`wiki-option-${this.active}`)?.scrollIntoView({ block: 'nearest' }))
    } else if (this.choices.length && event.key === 'Enter') void this.choose(Math.min(this.active, this.choices.length - 1))
    else return false
    event.preventDefault(); event.stopImmediatePropagation()
    return true
  }
}
