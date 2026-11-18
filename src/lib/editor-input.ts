import { Extension, InputRule } from '@tiptap/core'

export const inputRules = ['heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'taskList', 'taskItem', 'bold', 'italic', 'strike', 'code', 'folioInput']

// Convert wiki links only after the closing brackets, without delaying input.
export const smartInputRules = Extension.create({
  name: 'folioInput',
  addInputRules() {
    return [new InputRule({
      find: /\[\[([^\[\]\n|]+)(?:\|([^\]\n]+))?\]\]$/,
      handler: ({ state, range, match }) => {
        const node = state.schema.nodes.wikiLink.create({ target: match[1], label: match[2] ?? '' })
        state.tr.replaceWith(range.from, range.to, node)
      },
    })]
  },
})
