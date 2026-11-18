import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force'
import type { GraphNote, NoteGraph } from './graph.ts'

type Point = { x: number; y: number }
type Node = GraphNote & SimulationNodeDatum & Point & { radius: number }
type Edge = { source: Node; target: Node }
type Camera = Point & { scale: number }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function mountGraph(canvas: HTMLCanvasElement, open: (id: string) => void, select: (id: string) => void) {
  const context = canvas.getContext('2d')!
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  let nodes: Node[] = [], edges: Edge[] = []
  let neighbors = new Map<string, Set<string>>()
  let size = { width: 0, height: 0 }, ratio = 1
  let camera: Camera = { x: 0, y: 0, scale: 1 }, target = { ...camera }
  let hovered = '', selected = '', focus = 0
  let frame = 0, last = 0, fitted = false
  let drag: { pointer: number; down: Point; previous: Point; node?: Node; offset?: Point; moved: boolean } | undefined
  const simulation = forceSimulation<Node>([]).stop().alphaMin(.026).alphaDecay(.047).velocityDecay(.43)
    .force('charge', forceManyBody<Node>().strength(-185).distanceMax(900))
    .force('x', forceX<Node>().strength(.052)).force('y', forceY<Node>().strength(.052))
    .force('collision', forceCollide<Node>().radius((node) => node.radius + 19))

  function request() { if (!frame) frame = requestAnimationFrame(draw) }

  function fit(immediate = false) {
    if (!nodes.length || !size.width || !size.height) return
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const { x, y } of nodes) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
    const padding = nodes.length < 20 ? 196 : 115
    target = { x: -(minX + maxX) / 2, y: -(minY + maxY) / 2, scale: clamp(Math.min(size.width / (maxX - minX + padding), size.height / (maxY - minY + padding)), .08, 1.55) }
    target.x *= target.scale; target.y *= target.scale
    if (immediate || reduced.matches) camera = { ...target }
    request()
  }

  function resize() {
    const { width, height } = canvas.getBoundingClientRect()
    size = { width, height }
    ratio = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
    if (!fitted && width && height && nodes.length) { fit(true); fitted = true }
    request()
  }

  function draw(time: number) {
    frame = 0
    const blend = reduced.matches ? 1 : 1 - Math.exp(-Math.min(32, time - last || 16) / 54)
    last = time
    const focusTarget = hovered || selected ? 1 : 0
    focus += (focusTarget - focus) * blend
    camera.x += (target.x - camera.x) * blend
    camera.y += (target.y - camera.y) * blend
    camera.scale += (target.scale - camera.scale) * blend
    const { width, height } = size
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)
    context.translate(width / 2 + camera.x, height / 2 + camera.y)
    context.scale(camera.scale, camera.scale)
    const active = hovered || selected
    const near = neighbors.get(active)
    const radius = (node: Node) => Math.max(node.radius, 2 / camera.scale)
    const visible = (node: Node) => {
      const x = node.x * camera.scale + width / 2 + camera.x
      const y = node.y * camera.scale + height / 2 + camera.y
      return x >= -90 && x <= width + 90 && y >= -30 && y <= height + 30
    }
    for (const highlight of [false, true]) {
      context.beginPath()
      for (const { source, target } of edges) {
        if ((source.id === active || target.id === active) !== highlight) continue
        context.moveTo(source.x, source.y); context.lineTo(target.x, target.y)
      }
      context.lineWidth = (highlight ? 1.25 : 1) / camera.scale
      context.strokeStyle = highlight ? '#b2aaa0' : '#85817d'
      context.globalAlpha = highlight ? .75 : .33 - .21 * focus
      context.stroke()
    }
    const labels = []
    for (const node of nodes) {
      if (!visible(node)) continue
      const isActive = node.id === active
      const isNear = near?.has(node.id)
      const r = radius(node)
      context.globalAlpha = isActive || isNear ? 1 : 1 - focus * .68
      context.beginPath(); context.arc(node.x, node.y, r, 0, Math.PI * 2)
      context.fillStyle = isActive ? '#ece4d6' : isNear ? '#c5bbb0' : neighbors.has(node.id) ? '#9c9690' : '#625e5b'
      context.fill()
      if (isActive) {
        context.beginPath(); context.arc(node.x, node.y, r + 4 / camera.scale, 0, Math.PI * 2)
        context.strokeStyle = '#8e8780'; context.lineWidth = 1 / camera.scale; context.stroke()
      }
      if (isActive || (nodes.length <= 32 && camera.scale > .4) || (camera.scale > 1.1 && (isNear || node.incoming > 1))) labels.push({ node, isActive, isNear })
    }
    context.font = `${12 / camera.scale}px system-ui, sans-serif`
    context.textAlign = 'center'; context.textBaseline = 'top'
    for (const { node, isActive, isNear } of labels) {
      context.globalAlpha = isActive || isNear ? 1 : 1 - focus * .78
      context.fillStyle = isActive ? '#f0e9df' : '#b5afa8'
      context.fillText(node.title.length > 42 ? `${node.title.slice(0, 41)}…` : node.title, node.x, node.y + radius(node) + 8 / camera.scale)
    }
    context.globalAlpha = 1
    if (Math.abs(target.scale - camera.scale) > .001 || Math.hypot(target.x - camera.x, target.y - camera.y) > .15 || Math.abs(focusTarget - focus) > .01) request()
  }

  function update(graph: NoteGraph, root: string) {
    const previous = new Map(nodes.map((node) => [node.id, node]))
    selected = root; hovered = ''
    const reset = !fitted || !graph.nodes.some(({ id }) => previous.has(id))
    nodes = graph.nodes.map((node) => {
      const old = previous.get(node.id)
      return { ...old, ...node, x: old?.x ?? NaN, y: old?.y ?? NaN, radius: 4.2 + Math.min(7, Math.sqrt(node.incoming) * 2.2) }
    })
    const byId = new Map(nodes.map((node) => [node.id, node]))
    neighbors = new Map()
    edges = graph.links.map(({ source, target }) => {
      if (!neighbors.has(source)) neighbors.set(source, new Set())
      if (!neighbors.has(target)) neighbors.set(target, new Set())
      neighbors.get(source)!.add(target); neighbors.get(target)!.add(source)
      return { source: byId.get(source)!, target: byId.get(target)! }
    })
    simulation.stop().nodes(nodes).force('link', forceLink<Node, Edge>(edges).distance(nodes.length < 20 ? 104 : 68).strength(.49)).alpha(reset ? 1 : .42)
    if (reset || reduced.matches) simulation.tick(nodes.length > 1200 ? 8 : 36)
    if (!reduced.matches && nodes.length) simulation.on('tick', request).restart()
    if (reset && size.width && size.height && nodes.length) { fit(true); fitted = true }
    request()
  }

  const screen = (event: PointerEvent | WheelEvent): Point => {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left - size.width / 2, y: event.clientY - rect.top - size.height / 2 }
  }
  const world = ({ x, y }: Point) => ({ x: (x - camera.x) / camera.scale, y: (y - camera.y) / camera.scale })
  function hit(point: Point) {
    const p = world(point)
    let nearest: Node | undefined, distance = Infinity
    for (const node of nodes) {
      const d = Math.hypot(p.x - node.x, p.y - node.y)
      if (d < Math.max(node.radius + 3, 10 / camera.scale) && d < distance) { nearest = node; distance = d }
    }
    return nearest
  }
  function down(event: PointerEvent) {
    if (event.button !== 0 || drag) return
    const point = screen(event), node = hit(point), p = world(point)
    target = { ...camera }
    drag = { pointer: event.pointerId, down: point, previous: point, node, offset: node && { x: node.x - p.x, y: node.y - p.y }, moved: false }
    canvas.setPointerCapture(event.pointerId)
  }
  function move(event: PointerEvent) {
    const point = screen(event)
    if (drag?.pointer === event.pointerId) {
      if (!drag.moved && Math.hypot(point.x - drag.down.x, point.y - drag.down.y) < 4) return
      drag.moved = true
      if (drag.node && drag.offset) {
        const p = world(point)
        drag.node.x = drag.node.fx = p.x + drag.offset.x
        drag.node.y = drag.node.fy = p.y + drag.offset.y
        if (!reduced.matches) simulation.alphaTarget(.18).restart()
      } else {
        camera.x += point.x - drag.previous.x; camera.y += point.y - drag.previous.y
        target = { ...camera }
      }
      drag.previous = point
      canvas.style.cursor = 'grabbing'
    } else {
      hovered = hit(point)?.id ?? ''
      canvas.style.cursor = hovered ? 'pointer' : 'grab'
      select(hovered)
    }
    request()
  }
  function up(event: PointerEvent) {
    if (drag?.pointer !== event.pointerId) return
    const { node, moved } = drag
    drag = undefined
    if (node) {
      node.fx = node.fy = null
      simulation.alphaTarget(0)
      if (moved && reduced.matches) simulation.tick(16)
      if (!moved && event.type === 'pointerup') open(node.id)
    }
    canvas.style.cursor = 'grab'
    request()
  }
  function leave() { if (!drag) { hovered = ''; select(''); request() } }
  function zoom(factor: number, point: Point = { x: 0, y: 0 }) {
    const scale = clamp(target.scale * factor, .06, 4)
    const multiple = scale / target.scale
    target = { scale, x: point.x + (target.x - point.x) * multiple, y: point.y + (target.y - point.y) * multiple }
    if (reduced.matches) camera = { ...target }
    request()
  }
  function wheel(event: WheelEvent) {
    event.preventDefault()
    const amount = event.deltaY * (event.deltaMode === 1 ? 15 : event.deltaMode === 2 ? 200 : 1)
    zoom(Math.exp(clamp(-amount * .0028, -.36, .36)), screen(event))
  }
  function key(event: KeyboardEvent) {
    const nudge = { ArrowUp: [0, 40], ArrowDown: [0, -40], ArrowLeft: [40, 0], ArrowRight: [-40, 0] }[event.key]
    if (nudge) { target.x += nudge[0]; target.y += nudge[1]; camera = { ...target }; request() }
    else if (event.key === '+' || event.key === '=') zoom(1.22)
    else if (event.key === '-') zoom(1 / 1.22)
    else if (event.key === '0') fit(true)
    else return
    event.preventDefault()
  }
  function motionChange() { if (reduced.matches) simulation.stop(); request() }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up); canvas.addEventListener('pointerleave', leave)
  canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('keydown', key)
  reduced.addEventListener('change', motionChange)
  return { update, fit, zoom, destroy() {
    observer.disconnect(); simulation.stop(); cancelAnimationFrame(frame)
    canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up)
    canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up); canvas.removeEventListener('pointerleave', leave)
    canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('keydown', key)
    reduced.removeEventListener('change', motionChange)
  } }
}
