import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { blockAt, moveBlock, type MovableBlock } from './block-move.ts'

const handleWidth = 23

export const blockDrag = Extension.create({
  name: 'blockDrag',

  addKeyboardShortcuts() {
    const move = (by: -1 | 1) => {
      const { state, view } = this.editor
      const block = blockAt(state.doc, state.selection.head)
      if (!block) return false
      const tr = moveBlock(state, block, block.index + (by < 0 ? -1 : 2))
      if (!tr) return false
      view.dispatch(tr)
      return true
    }
    return { 'Alt-Shift-ArrowUp': () => move(-1), 'Alt-Shift-ArrowDown': () => move(1) }
  },

  addProseMirrorPlugins() {
    return [new Plugin({
      view(view) {
        const handle = document.createElement('button')
        handle.type = 'button'
        handle.className = 'block-drag-handle'
        handle.style.width = `${handleWidth}px`
        handle.setAttribute('aria-label', 'Drag block to reorder')
        handle.title = 'Drag to reorder · Option–Shift–↑ / ↓'
        handle.tabIndex = -1
        const line = document.createElement('div')
        line.className = 'block-drop-line'
        const ghost = document.createElement('div')
        ghost.className = 'block-drag-ghost'
        line.setAttribute('aria-hidden', 'true')
        ghost.setAttribute('aria-hidden', 'true')
        document.body.append(handle, line, ghost)
        handle.hidden = line.hidden = ghost.hidden = true

        let hovered: MovableBlock | undefined
        let drag: { block: MovableBlock; original: Element; siblings: Element[]; id: number; startX: number; startY: number; x: number; y: number; moving: boolean; boundary?: number } | undefined
        let frame = 0

        const grab = (block: MovableBlock) => view.nodeDOM(block.from)
        const pane = () => view.dom.closest<HTMLElement>('.rich-pane')

        function hideHandle() { hovered = undefined; handle.hidden = true }

        function hover(event: PointerEvent) {
          if (drag || event.target === handle) return
          if (hovered && event.target instanceof Node && !view.dom.contains(event.target)) {
            const hit = handle.getBoundingClientRect()
            if (event.clientX >= hit.left - 3 && event.clientX <= hit.right + 3 && event.clientY >= hit.top - 3 && event.clientY <= hit.bottom + 3) return
          }
          if (!view.editable || view.composing || !view.state.selection.empty || event.buttons || !(event.target instanceof Node) || !view.dom.contains(event.target)) {
            hideHandle()
            return
          }
          const found = view.posAtCoords({ left: event.clientX, top: event.clientY })
          const block = found && blockAt(view.state.doc, found.pos)
          const element = block && grab(block)
          if (!block || !(element instanceof Element)) { hideHandle(); return }
          const rect = element.getBoundingClientRect()
          const bounds = pane()?.getBoundingClientRect()
          if (!bounds || rect.top < bounds.top || rect.top + 22 > bounds.bottom) { hideHandle(); return }
          hovered = block
          handle.style.transform = `translate3d(${Math.max(bounds.left + 2, rect.left - handleWidth)}px, ${rect.top + 1}px, 0)`
          handle.hidden = false
        }

        function start(event: PointerEvent) {
          if (event.button !== 0 || !view.editable || !hovered || drag) return
          const original = grab(hovered)
          if (!(original instanceof Element)) return
          const siblings: Element[] = []
          let offset = hovered.base
          for (let index = 0; index < hovered.parent.childCount; index++) {
            const sibling = view.nodeDOM(offset)
            if (!(sibling instanceof Element)) return
            siblings.push(sibling)
            offset += hovered.parent.child(index).nodeSize
          }
          event.preventDefault()
          handle.setPointerCapture(event.pointerId)
          drag = { block: hovered, original, siblings, id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moving: false }
        }

        function render() {
          frame = 0
          if (!drag?.moving) return
          const scroller = pane()
          if (!scroller) return
          const bounds = scroller.getBoundingClientRect()
          const { x, y, block, siblings } = drag
          const within = x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom
          ghost.style.transform = `translate3d(${Math.max(8, Math.min(x + 12, window.innerWidth - ghost.offsetWidth - 8))}px, ${Math.max(8, Math.min(y + 10, window.innerHeight - 35))}px, 0)`
          drag.boundary = undefined
          line.hidden = true
          if (!within) return

          const speed = y > bounds.bottom - 38 ? Math.ceil((y - bounds.bottom + 38) / 4) : y < bounds.top + 38 ? -Math.ceil((bounds.top + 38 - y) / 4) : 0
          if (speed) {
            const top = scroller.scrollTop
            scroller.scrollTop += speed
            if (top !== scroller.scrollTop) frame = requestAnimationFrame(render)
          }

          let lo = 0, hi = siblings.length
          while (lo < hi) {
            const mid = (lo + hi) >>> 1
            const rect = siblings[mid].getBoundingClientRect()
            if (y < rect.top + rect.height / 2) hi = mid
            else lo = mid + 1
          }
          const boundary = lo
          if (boundary === block.index || boundary === block.index + 1) return
          const rect = siblings[Math.min(boundary, siblings.length - 1)].getBoundingClientRect()
          const at = boundary === siblings.length ? rect.bottom + 2 : rect.top - 2
          if (at < bounds.top || at >= bounds.bottom) return
          drag.boundary = boundary
          line.style.width = `${Math.max(0, Math.min(bounds.right, rect.right) - rect.left)}px`
          line.style.transform = `translate3d(${rect.left}px, ${at}px, 0)`
          line.hidden = false
        }

        function track(event: PointerEvent) {
          if (drag?.id !== event.pointerId) return
          drag.x = event.clientX; drag.y = event.clientY
          if (!drag.moving) {
            if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 5) return
            drag.moving = true
            drag.original.classList.add('is-dragging-block')
            ghost.textContent = drag.block.node.textContent.trim().slice(0, 100) || 'Block'
            ghost.hidden = false
          }
          if (!frame) frame = requestAnimationFrame(render)
        }

        function finish(commit: boolean) {
          const current = drag
          if (!current) return
          drag = undefined
          if (handle.hasPointerCapture(current.id)) handle.releasePointerCapture(current.id)
          cancelAnimationFrame(frame); frame = 0
          current.original.classList.remove('is-dragging-block')
          line.hidden = ghost.hidden = true
          hideHandle()
          if (!commit || current.boundary === undefined) return
          const tr = moveBlock(view.state, current.block, current.boundary)
          if (tr) { view.dispatch(tr); view.focus() }
        }

        function release(event: PointerEvent) {
          if (drag?.id !== event.pointerId) return
          if (drag.moving && event.type === 'pointerup') {
            cancelAnimationFrame(frame)
            drag.x = event.clientX; drag.y = event.clientY
            render()
          }
          finish(event.type === 'pointerup')
        }

        const cancel = () => finish(false)
        const escape = (event: KeyboardEvent) => {
          if (drag && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); cancel() }
        }
        const scroll = () => { if (!drag) hideHandle() }
        handle.addEventListener('pointerdown', start)
        handle.addEventListener('pointermove', track)
        handle.addEventListener('pointerup', release)
        handle.addEventListener('pointercancel', release)
        handle.addEventListener('lostpointercapture', cancel)
        window.addEventListener('pointermove', hover)
        window.addEventListener('keydown', escape, true)
        window.addEventListener('blur', cancel)
        window.addEventListener('scroll', scroll, true)
        return {
          update(next, old) {
            if (next.state.doc !== old.doc || !next.state.selection.empty) {
              if (drag) cancel(); else hideHandle()
            }
          },
          destroy() {
            cancel()
            handle.remove(); line.remove(); ghost.remove()
            window.removeEventListener('pointermove', hover)
            window.removeEventListener('keydown', escape, true)
            window.removeEventListener('blur', cancel)
            window.removeEventListener('scroll', scroll, true)
          },
        }
      },
    })]
  },
})
