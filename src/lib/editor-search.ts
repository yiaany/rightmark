import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { SearchMatch } from './notes.ts'

export const searchDecoration = new PluginKey<DecorationSet>('folioSearch')

export const editorSearch = Extension.create({
  name: 'folioSearch',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: searchDecoration,
      state: {
        init: () => DecorationSet.empty,
        apply(transaction, previous) {
          const range = transaction.getMeta(searchDecoration) as SearchMatch | null | undefined
          if (range) return DecorationSet.create(transaction.doc, [Decoration.inline(range.from, range.to, { class: 'document-search-hit' })])
          if (transaction.getMeta('appendedTransaction')) return previous.map(transaction.mapping, transaction.doc)
          return range === null || transaction.docChanged || transaction.selectionSet ? DecorationSet.empty : previous
        },
      },
      props: { decorations: (state) => searchDecoration.getState(state) },
    })]
  },
})
