import { Extension } from '@tiptap/core'
import { Plugin, TextSelection } from '@tiptap/pm/state'

export const smoothCaret = Extension.create({
  name: 'smoothCaret',
  addProseMirrorPlugins() {
    return [new Plugin({
      view(view) {
        const native = view.dom
        const motion = matchMedia('(prefers-reduced-motion: reduce)')
        const caret = document.createElement('span')
        caret.className = 'editor-caret'
        caret.setAttribute('aria-hidden', 'true')
        document.body.append(caret)
        let frame = 0
        let prior: { x: number; y: number } | undefined
        let glide: Animation | undefined

        function hide() {
          glide?.cancel()
          prior = undefined
          caret.hidden = true
          native.classList.remove('draw-caret')
        }

        function refresh() {
          const selection = view.state.selection
          if (motion.matches || !view.editable || !view.hasFocus() || view.composing || !selection.empty || !(selection instanceof TextSelection)) {
            hide()
            return
          }
          const rect = view.coordsAtPos(selection.head)
          const bounds = native.closest('.rich-pane')?.getBoundingClientRect()
          if (!bounds || rect.top < bounds.top || rect.bottom > bounds.bottom || rect.left < bounds.left || rect.left > bounds.right || rect.bottom <= rect.top) {
            hide()
            return
          }
          const x = Math.round(rect.left), y = Math.round(rect.top)
          if (prior?.x === x && prior.y === y && !caret.hidden) return
          const previous = prior && caret.getBoundingClientRect()
          glide?.cancel()
          prior = { x, y }
          caret.hidden = false
          caret.style.height = `${rect.bottom - rect.top}px`
          caret.style.transform = `translate3d(${x}px, ${y}px, 0)`
          native.classList.add('draw-caret')
          if (previous && Math.abs(previous.top - y) < 2 && Math.abs(previous.left - x) < 42) {
            glide = caret.animate([`translate3d(${previous.left}px, ${y}px, 0)`, `translate3d(${x}px, ${y}px, 0)`].map((transform) => ({ transform })), {
              duration: 65, easing: 'cubic-bezier(.23, 1, .32, 1)',
            })
          }
        }

        const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; refresh() }) }
        const reset = () => { hide(); schedule() }
        native.addEventListener('focus', schedule)
        native.addEventListener('blur', hide)
        native.addEventListener('compositionstart', hide)
        native.addEventListener('compositionend', schedule)
        window.addEventListener('scroll', reset, true)
        window.addEventListener('resize', reset)
        motion.addEventListener('change', reset)
        hide()
        return {
          update: (_view, old) => {
            if (old.doc !== view.state.doc || !old.selection.eq(view.state.selection)) schedule()
          },
          destroy() {
            cancelAnimationFrame(frame)
            native.removeEventListener('focus', schedule)
            native.removeEventListener('blur', hide)
            native.removeEventListener('compositionstart', hide)
            native.removeEventListener('compositionend', schedule)
            window.removeEventListener('scroll', reset, true)
            window.removeEventListener('resize', reset)
            motion.removeEventListener('change', reset)
            hide()
            caret.remove()
          },
        }
      },
    })]
  },
})
