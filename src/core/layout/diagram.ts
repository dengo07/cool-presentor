import type { BlockOf, DiagramEdge, DiagramNode } from '../model'
import { mix, readableOn } from '../color'
import type { Color } from '../scene'
import { add, type Box, type Ctx, text } from './ctx'

// ---------------------------------------------------------------------------
// Diagrams: boxes and arrows laid out on a grid, drawn with native shapes so
// they stay editable in PowerPoint and follow the theme.
//
// Placement: nodes get a layer along the main axis from the arrows (longest
// path, cycles broken), then an order inside each layer that keeps groups
// together and reduces crossings (barycenter sweeps). `row`/`col` pin a node.
// ---------------------------------------------------------------------------

export interface GridPos {
  col: number
  row: number
}

type Diagram = BlockOf<'diagram'>

function validEdges(d: Diagram): DiagramEdge[] {
  const ids = new Set(d.nodes.map((n) => n.id))
  return d.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
}

/** Longest-path rank of every key in a directed graph; cycles are broken at their back edges (DFS in key order). */
function rankDag(keys: string[], pairs: [string, string][]): Map<string, number> {
  const out = new Map(keys.map((k) => [k, [] as string[]]))
  for (const [a, b] of pairs) if (a !== b && !out.get(a)!.includes(b)) out.get(a)!.push(b)
  const state = new Map<string, number>()
  const fwd = new Map(keys.map((k) => [k, [] as string[]]))
  const visit = (k: string): void => {
    state.set(k, 1)
    for (const to of out.get(k)!) {
      const st = state.get(to) ?? 0
      if (st === 1) continue // back edge
      fwd.get(k)!.push(to)
      if (st === 0) visit(to)
    }
    state.set(k, 2)
  }
  for (const k of keys) if (!state.get(k)) visit(k)
  const indeg = new Map(keys.map((k) => [k, 0]))
  for (const k of keys) for (const to of fwd.get(k)!) indeg.set(to, indeg.get(to)! + 1)
  const rank = new Map(keys.map((k) => [k, 0]))
  const queue = keys.filter((k) => indeg.get(k) === 0)
  while (queue.length) {
    const k = queue.shift()!
    for (const to of fwd.get(k)!) {
      rank.set(to, Math.max(rank.get(to)!, rank.get(k)! + 1))
      indeg.set(to, indeg.get(to)! - 1)
      if (indeg.get(to) === 0) queue.push(to)
    }
  }
  return rank
}

/** Grid cell of every node. Pure – exported for tests. */
export function placeNodes(d: Diagram): Map<string, GridPos> {
  const down = d.direction === 'down'
  const nodes = d.nodes
  const edges = validEdges(d)
  const index = new Map(nodes.map((n, i) => [n.id, i]))
  const pinnedMain = (n: DiagramNode): number | undefined => (down ? n.row : n.col)
  const pinnedCross = (n: DiagramNode): number | undefined => (down ? n.col : n.row)

  // 1. layer along the main axis. A group is one band across the flow (its
  //    members side by side); everything else is layered by the arrows
  //    (longest path, cycles broken). Pins win.
  const keyOf = (n: DiagramNode): string => (n.group ? `g:${n.group}` : `n:${n.id}`)
  const nodeKey = new Map(nodes.map((n) => [n.id, keyOf(n)]))
  const bands = rankDag(
    [...new Set(nodes.map(keyOf))],
    edges.map((e) => [nodeKey.get(e.from)!, nodeKey.get(e.to)!])
  )
  // inside a group, its own arrows give the order across the band
  const inner = rankDag(
    nodes.map((n) => n.id),
    edges.filter((e) => nodes[index.get(e.from)!].group && nodeKey.get(e.from) === nodeKey.get(e.to)).map((e) => [e.from, e.to])
  )
  const layer = new Map(nodes.map((n) => [n.id, pinnedMain(n) ?? bands.get(keyOf(n))!]))

  // 3. order inside each layer
  const layers: string[][] = []
  for (const n of nodes) (layers[layer.get(n.id)!] ??= []).push(n.id)
  const neighbours = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  for (const e of edges) {
    neighbours.get(e.from)!.push(e.to)
    neighbours.get(e.to)!.push(e.from)
  }
  const cross = new Map<string, number>()
  const groupOf = (id: string): string => nodes[index.get(id)!].group ?? ''
  const assign = (ids: string[]): void => {
    // pinned nodes keep their slot, the rest fill the gaps in order
    const taken = new Set<number>()
    const free: string[] = []
    for (const id of ids) {
      const p = pinnedCross(nodes[index.get(id)!])
      if (p !== undefined && !taken.has(p)) {
        cross.set(id, p)
        taken.add(p)
      } else free.push(id)
    }
    let k = 0
    for (const id of free) {
      while (taken.has(k)) k++
      cross.set(id, k++)
    }
  }
  const firstSeen = new Map<string, number>()
  nodes.forEach((n, i) => firstSeen.has(groupOf(n.id)) || firstSeen.set(groupOf(n.id), i))
  for (const l of layers)
    if (l)
      assign([...l].sort((a, b) => firstSeen.get(groupOf(a))! - firstSeen.get(groupOf(b))! || inner.get(a)! - inner.get(b)! || index.get(a)! - index.get(b)!))
  const order = (l: string[], ref: number): void => {
    const bary = new Map<string, number>()
    for (const id of l) {
      const ns = neighbours.get(id)!.filter((x) => layer.get(x) === ref)
      bary.set(id, ns.length ? ns.reduce((s, x) => s + cross.get(x)!, 0) / ns.length : cross.get(id)!)
    }
    // keep each group together: sort groups by their mean, then members by their own
    const gMean = new Map<string, number>()
    for (const g of new Set(l.map(groupOf))) {
      const m = l.filter((id) => groupOf(id) === g)
      gMean.set(g, m.reduce((s, id) => s + bary.get(id)!, 0) / m.length)
    }
    const sorted = [...l].sort(
      (a, b) =>
        gMean.get(groupOf(a))! - gMean.get(groupOf(b))! ||
        groupOf(a).localeCompare(groupOf(b)) ||
        (groupOf(a) ? inner.get(a)! - inner.get(b)! : 0) ||
        bary.get(a)! - bary.get(b)! ||
        index.get(a)! - index.get(b)!
    )
    assign(sorted)
  }
  for (let sweep = 0; sweep < 3; sweep++) {
    for (let i = 1; i < layers.length; i++) if (layers[i]) order(layers[i], i - 1)
    for (let i = layers.length - 2; i >= 0; i--) if (layers[i]) order(layers[i], i + 1)
  }

  const pos = new Map<string, GridPos>()
  for (const n of nodes) {
    const main = layer.get(n.id)!
    const c = cross.get(n.id)!
    pos.set(n.id, down ? { col: c, row: main } : { col: main, row: c })
  }
  return pos
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

type Side = 'l' | 'r' | 't' | 'b'

const highlightColor = (ctx: Ctx): Color => (ctx.theme.highlight.kind === 'solid' ? ctx.theme.highlight.color : ctx.theme.highlight.stops[0].color)

export function renderDiagram(ctx: Ctx, b: Diagram, box: Box): void {
  const t = ctx.theme
  if (!b.nodes.length) {
    text(ctx, { id: `${b.id}-empty`, role: 'small', text: 'Add boxes and arrows to draw the diagram.', ...box })
    return
  }
  const pos = placeNodes(b)
  const edges = validEdges(b)
  const cols = Math.max(...[...pos.values()].map((p) => p.col)) + 1
  const rows = Math.max(...[...pos.values()].map((p) => p.row)) + 1
  const groups = [...new Set(b.nodes.map((n) => n.group).filter((g): g is string => !!g))]
  const labelled = edges.some((e) => e.label)

  // grid geometry. Gaps leave room for arrow labels; gaps where a group frame
  // starts or ends get extra room for the frame and its header.
  const groupPad = groups.length ? 0.16 : 0
  const groupHead = groups.length ? 0.32 : 0
  const members = (g: string): GridPos[] => b.nodes.filter((n) => n.group === g).map((n) => pos.get(n.id)!)
  const frameAt = (axis: 'row' | 'col', k: number): boolean =>
    groups.some((g) => {
      const ps = members(g).map((p) => p[axis])
      return Math.max(...ps) === k || Math.min(...ps) === k + 1
    })
  const baseX = Math.min(labelled ? 1.2 : 0.7, box.w * 0.1)
  const baseY = Math.min(labelled ? 0.7 : 0.5, box.h * 0.1)
  const colGaps = Array.from({ length: cols - 1 }, (_, k) => baseX + (frameAt('col', k) ? groupPad * 2 + 0.1 : 0))
  const rowGaps = Array.from({ length: rows - 1 }, (_, k) => baseY + (frameAt('row', k) ? groupPad * 2 + groupHead : 0))
  const inner = { x: box.x + groupPad, y: box.y + groupPad + groupHead, w: box.w - groupPad * 2, h: box.h - groupPad * 2 - groupHead }
  // node size from what is left; shrink the gaps when there is too little room
  const fit = (n: number, avail: number, gaps: number[], min: number, max: number): number => {
    const sum = gaps.reduce((a, g) => a + g, 0)
    let size = (avail - sum) / n
    if (size < min && sum > 0) {
      const scale = Math.max(0.3, (avail - n * min) / sum)
      gaps.forEach((g, i) => (gaps[i] = g * scale))
      size = (avail - gaps.reduce((a, g) => a + g, 0)) / n
    }
    return Math.max(min * 0.75, Math.min(max, size))
  }
  const nodeW = fit(cols, inner.w, colGaps, 1.1, 3.3)
  const nodeH = fit(rows, inner.h, rowGaps, 0.5, 1.3)
  const offset = (gaps: number[], k: number): number => gaps.slice(0, k).reduce((a, g) => a + g, 0)
  const gridW = nodeW * cols + offset(colGaps, cols - 1)
  const gridH = nodeH * rows + offset(rowGaps, rows - 1)
  const gx = inner.x + (inner.w - gridW) / 2
  const gy = inner.y + Math.max(0, (inner.h - gridH) / 2)
  const rect = new Map<string, Rect>()
  for (const n of b.nodes) {
    const p = pos.get(n.id)!
    rect.set(n.id, { x: gx + p.col * nodeW + offset(colGaps, p.col), y: gy + p.row * nodeH + offset(rowGaps, p.row), w: nodeW, h: nodeH })
  }

  // group containers (drawn first, behind everything)
  groups.forEach((g, gi) => {
    const rs = b.nodes.filter((n) => n.group === g).map((n) => rect.get(n.id)!)
    const x = Math.min(...rs.map((r) => r.x)) - groupPad
    const y = Math.min(...rs.map((r) => r.y)) - groupPad - groupHead
    const w = Math.max(...rs.map((r) => r.x + r.w)) + groupPad - x
    const h = Math.max(...rs.map((r) => r.y + r.h)) + groupPad - y
    add(ctx, {
      kind: 'shape',
      id: `${b.id}-g${gi}`,
      shape: t.radius > 0 ? 'roundRect' : 'rect',
      radius: Math.min(t.radius * 1.4, 0.3),
      x,
      y,
      w,
      h,
      fill: { kind: 'solid', color: t.text, alpha: t.dark ? 0.04 : 0.025 },
      line: { color: t.text, width: 1, alpha: 0.35, dash: true }
    })
    text(ctx, { id: `${b.id}-gl${gi}`, role: 'label', text: g, x: x + 0.14, y: y + 0.08, w: w - 0.28, h: groupHead - 0.04, maxLines: 1, max: 11, min: 8, color: t.muted })
  })

  // edges: spread attachment points when several arrows share a side
  const centre = (r: Rect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
  const occupied = (col: number, row: number): boolean => [...pos.values()].some((p) => p.col === col && p.row === row)
  // a straight arrow along a row/column that would cross other boxes detours around them (U shape)
  const detour = edges.map((e) => {
    const a = pos.get(e.from)!
    const c = pos.get(e.to)!
    if (a.row === c.row && Math.abs(a.col - c.col) > 1) {
      for (let k = Math.min(a.col, c.col) + 1; k < Math.max(a.col, c.col); k++) if (occupied(k, a.row)) return 'row'
    }
    if (a.col === c.col && Math.abs(a.row - c.row) > 1) {
      for (let k = Math.min(a.row, c.row) + 1; k < Math.max(a.row, c.row); k++) if (occupied(a.col, k)) return 'col'
    }
    return null
  })
  const sides = edges.map((e, i) => {
    const a = pos.get(e.from)!
    const c = pos.get(e.to)!
    if (detour[i] === 'row') return ['b', 'b'] as Side[]
    if (detour[i] === 'col') return ['r', 'r'] as Side[]
    const horizontal = a.row === c.row || (b.direction !== 'down' && a.col !== c.col)
    if (horizontal) return a.col <= c.col ? (['r', 'l'] as Side[]) : (['l', 'r'] as Side[])
    return a.row <= c.row ? (['b', 't'] as Side[]) : (['t', 'b'] as Side[])
  })
  const slots = new Map<string, number[]>() // "node:side" -> edge indices
  edges.forEach((e, i) => {
    for (const [k, node] of [
      [0, e.from],
      [1, e.to]
    ] as const) {
      const key = `${node}:${sides[i][k]}`
      slots.set(key, [...(slots.get(key) ?? []), i * 2 + k])
    }
  })
  for (const [key, list] of slots) {
    const side = key.split(':')[1] as Side
    const other = (slot: number): number => {
      const e = edges[slot >> 1]
      const p = centre(rect.get((slot & 1) === 0 ? e.to : e.from)!)
      return side === 'l' || side === 'r' ? p.y : p.x
    }
    list.sort((p, q) => other(p) - other(q) || (p >> 1) - (q >> 1))
  }
  const anchor = (node: string, side: Side, slot: number): { x: number; y: number } => {
    const r = rect.get(node)!
    const list = slots.get(`${node}:${side}`)!
    // arrows sharing a side sit ~0.4in apart so their labels do not collide
    const len = side === 'l' || side === 'r' ? r.h : r.w
    const d = (list.indexOf(slot) - (list.length - 1) / 2) * Math.min(0.42, (len * 0.8) / list.length)
    if (side === 'l') return { x: r.x, y: r.y + r.h / 2 + d }
    if (side === 'r') return { x: r.x + r.w, y: r.y + r.h / 2 + d }
    if (side === 't') return { x: r.x + r.w / 2 + d, y: r.y }
    return { x: r.x + r.w / 2 + d, y: r.y + r.h }
  }

  // gap "channels" between rows/columns are free of boxes; long arrows that
  // would cross a box are routed through them instead
  const colRight = (k: number): number => gx + (k + 1) * nodeW + offset(colGaps, k)
  const rowBottom = (k: number): number => gy + (k + 1) * nodeH + offset(rowGaps, k)
  const colChannel = (k: number): number => (k < 0 ? gx - 0.22 : k >= cols - 1 ? gx + gridW + 0.22 : colRight(k) + colGaps[k] / 2)
  const rowChannel = (k: number): number => (k < 0 ? gy - 0.22 : k >= rows - 1 ? gy + gridH + 0.22 : rowBottom(k) + rowGaps[k] / 2)
  const boxes = b.nodes.map((n) => ({ id: n.id, r: rect.get(n.id)! }))
  type Pt = { x: number; y: number }
  const crosses = (a: Pt, c: Pt, r: Rect, m = 0.03): boolean => {
    if (Math.abs(a.y - c.y) < 1e-6) return a.y > r.y + m && a.y < r.y + r.h - m && Math.max(a.x, c.x) > r.x + m && Math.min(a.x, c.x) < r.x + r.w - m
    return a.x > r.x + m && a.x < r.x + r.w - m && Math.max(a.y, c.y) > r.y + m && Math.min(a.y, c.y) < r.y + r.h - m
  }
  const hits = (pts: Pt[], skip: string[]): number => {
    let n = 0
    for (let k = 0; k < pts.length - 1; k++) for (const bx of boxes) if (!skip.includes(bx.id) && crosses(pts[k], pts[k + 1], bx.r)) n++
    return n
  }
  const clean = (pts: Pt[]): Pt[] => pts.filter((pt, k) => k === 0 || Math.hypot(pt.x - pts[k - 1].x, pt.y - pts[k - 1].y) > 1e-4)

  const routes: Pt[][] = []
  edges.forEach((e, i) => {
    const [sa, sb] = sides[i]
    const p = anchor(e.from, sa, i * 2)
    const q = anchor(e.to, sb, i * 2 + 1)
    const a = pos.get(e.from)!
    const c = pos.get(e.to)!
    const horizontal = sa === 'l' || sa === 'r'
    if (detour[i] === 'row') {
      // under the row, through the gap below it (or just below the grid)
      const y = rowChannel(a.row)
      routes[i] = [p, { x: p.x, y }, { x: q.x, y }, q]
      return
    }
    if (detour[i] === 'col') {
      const x = colChannel(a.col)
      routes[i] = [p, { x, y: p.y }, { x, y: q.y }, q]
      return
    }
    const simple: Pt[] = [p]
    if (horizontal && Math.abs(p.y - q.y) > 0.01) {
      const mx = (p.x + q.x) / 2
      simple.push({ x: mx, y: p.y }, { x: mx, y: q.y })
    } else if (!horizontal && Math.abs(p.x - q.x) > 0.01) {
      const my = (p.y + q.y) / 2
      simple.push({ x: p.x, y: my }, { x: q.x, y: my })
    }
    simple.push(q)
    const skip = [e.from, e.to]
    if (!hits(simple, skip)) {
      routes[i] = simple
      return
    }
    // through the channels: out of the source, along the gap next to the target's row/column, in
    const nudge = ((i % 3) - 1) * 0.06 // keeps arrows sharing a channel apart
    let channel: Pt[]
    if (horizontal) {
      const x1 = (sa === 'r' ? colChannel(a.col) : colChannel(a.col - 1)) + nudge
      const x2 = (sb === 'l' ? colChannel(c.col - 1) : colChannel(c.col)) + nudge
      const y = (c.row > a.row ? rowChannel(c.row - 1) : c.row < a.row ? rowChannel(c.row) : rowChannel(a.row)) + nudge
      channel = [p, { x: x1, y: p.y }, { x: x1, y }, { x: x2, y }, { x: x2, y: q.y }, q]
    } else {
      const y1 = (sa === 'b' ? rowChannel(a.row) : rowChannel(a.row - 1)) + nudge
      const y2 = (sb === 't' ? rowChannel(c.row - 1) : rowChannel(c.row)) + nudge
      const x = (c.col > a.col ? colChannel(c.col - 1) : c.col < a.col ? colChannel(c.col) : colChannel(a.col)) + nudge
      channel = [p, { x: p.x, y: y1 }, { x, y: y1 }, { x, y: y2 }, { x: q.x, y: y2 }, q]
    }
    routes[i] = hits(channel, skip) < hits(simple, skip) ? clean(channel) : simple
  })

  edges.forEach((e, i) => {
    const pts = routes[i]
    const color = e.style === 'dashed' ? t.muted : t.text
    const width = e.style === 'bold' ? 2.5 : 1.5
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k]
      const c = pts[k + 1]
      add(ctx, {
        kind: 'shape',
        id: `${b.id}-e${i}-${k}`,
        shape: 'line',
        x: a.x,
        y: a.y,
        w: c.x - a.x,
        h: c.y - a.y,
        line: { color, width, alpha: e.style === 'bold' ? 1 : 0.8, dash: e.style === 'dashed' },
        arrow: { start: k === 0 && !!e.both, end: k === pts.length - 2 }
      })
    }
  })

  // arrow labels: the first spot along (or beside) the arrow that is free of boxes and other labels
  const placed: Rect[] = []
  const overlaps = (r: Rect, o: Rect): boolean => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y
  const labels: { id: string; text: string; r: Rect }[] = []
  edges.forEach((e, i) => {
    if (!e.label) return
    const w = Math.min(2.4, Math.max(0.8, e.label.length * 0.075 + 0.36))
    const h = 0.3
    const segs = routes[i]
      .slice(0, -1)
      .map((a, k) => ({ a, c: routes[i][k + 1] }))
      .sort((s1, s2) => Math.hypot(s2.c.x - s2.a.x, s2.c.y - s2.a.y) - Math.hypot(s1.c.x - s1.a.x, s1.c.y - s1.a.y))
      .slice(0, 2)
    const cands: Rect[] = []
    for (const { a, c } of segs) {
      const vertical = Math.abs(a.x - c.x) < 1e-6
      const along = [0.5, 0.3, 0.7].map((f) => ({ x: a.x + (c.x - a.x) * f - w / 2, y: a.y + (c.y - a.y) * f - h / 2, w, h }))
      const x = (a.x + c.x) / 2
      const y = (a.y + c.y) / 2
      const beside = vertical
        ? [
            { x: x - w - 0.06, y: y - h / 2, w, h },
            { x: x + 0.06, y: y - h / 2, w, h }
          ]
        : [
            { x: x - w / 2, y: y - h - 0.05, w, h },
            { x: x - w / 2, y: y + 0.05, w, h }
          ]
      // short vertical runs (between bands) are too short to stack labels on: put them beside the line
      cands.push(...(vertical && Math.abs(c.y - a.y) < 1.2 ? [...beside, ...along] : [...along, ...beside]))
    }
    const free = cands.find((r) => !placed.some((o) => overlaps(r, o)) && !boxes.some((bx) => overlaps(r, bx.r)))
    const r = free ?? cands.find((r) => !placed.some((o) => overlaps(r, o))) ?? cands[0]
    placed.push(r)
    labels.push({ id: `${b.id}-el${i}`, text: e.label, r })
  })

  // nodes
  const hl = highlightColor(ctx)
  b.nodes.forEach((n) => {
    const r = rect.get(n.id)!
    const style = n.style ?? 'default'
    const fill =
      style === 'accent'
        ? t.accents[0]
        : style === 'dark'
          ? t.text
          : style === 'alert'
            ? mix(hl, t.bgColor, 0.86)
            : style === 'muted'
              ? mix(t.bgColor, t.text, 0.06)
              : undefined
    const ink = style === 'accent' ? readableOn(t.accents[0]) : style === 'dark' ? t.bgColor : style === 'alert' ? hl : style === 'muted' ? t.muted : t.text
    const sub = style === 'accent' || style === 'dark' ? mix(ink, fill!, 0.25) : t.muted
    const shape = n.shape ?? 'box'
    add(ctx, {
      kind: 'shape',
      id: `${b.id}-n-${n.id}`,
      shape: shape === 'circle' ? 'ellipse' : shape === 'diamond' ? 'diamond' : t.radius > 0 || shape === 'pill' ? 'roundRect' : 'rect',
      radius: shape === 'pill' ? r.h / 2 : Math.min(t.radius, 0.2),
      ...r,
      fill: fill ? { kind: 'solid', color: fill } : t.card.fill,
      line: style === 'alert' ? { color: hl, width: 1.75 } : fill ? undefined : t.card.line
    })
    // text area: diamonds and circles have less usable room
    const inset = shape === 'diamond' ? { x: r.w * 0.22, y: r.h * 0.2 } : shape === 'circle' ? { x: r.w * 0.14, y: r.h * 0.14 } : { x: 0.14, y: 0.08 }
    const ib = { x: r.x + inset.x, y: r.y + inset.y, w: r.w - inset.x * 2, h: r.h - inset.y * 2 }
    if (n.text) {
      const lh = ib.h * 0.48
      text(ctx, { id: `${b.id}-nl-${n.id}`, role: 'cardTitle', text: n.label, ...ib, h: lh, align: 'center', valign: 'bottom', color: ink, max: 20, min: 9, maxLines: 2 })
      text(ctx, { id: `${b.id}-nt-${n.id}`, role: 'small', text: n.text, x: ib.x, y: ib.y + lh + 0.03, w: ib.w, h: ib.h - lh - 0.03, align: 'center', valign: 'top', color: sub, max: 13, min: 8, maxLines: 3 })
    } else text(ctx, { id: `${b.id}-nl-${n.id}`, role: 'cardTitle', text: n.label, ...ib, align: 'center', valign: 'middle', color: ink, max: 20, min: 9, maxLines: 3 })
  })

  // arrow labels last, on a small pill so lines do not run through the text
  for (const l of labels) {
    add(ctx, {
      kind: 'shape',
      id: `${l.id}-bg`,
      shape: 'roundRect',
      radius: l.r.h / 2,
      ...l.r,
      fill: t.card.fill.kind === 'solid' && (t.card.fill.alpha ?? 1) >= 1 ? t.card.fill : { kind: 'solid', color: t.bgColor },
      line: { color: t.text, width: 0.75, alpha: 0.18 }
    })
    text(ctx, { id: l.id, role: 'small', text: l.text, x: l.r.x + 0.06, y: l.r.y, w: l.r.w - 0.12, h: l.r.h, align: 'center', valign: 'middle', color: t.text, max: 11, min: 7, maxLines: 1 })
  }
}
