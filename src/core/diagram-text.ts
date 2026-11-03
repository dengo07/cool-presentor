import type { BlockOf, DiagramEdge, DiagramNode } from './model'

// ---------------------------------------------------------------------------
// Plain-text form of a diagram, used by the block editor:
//
//   direction: right                       (or: down)
//   pi: Raspberry Pi 5 | Vision, ROS 2 {group: Vehicle; style: dark}
//   esp: ESP32 {group: Vehicle; at: 1,0}
//   pi -> esp: UART
//   a --> b      dashed        a => b    bold        a <-> b   both ends
//
// Node options: group, style (default accent dark muted alert),
// shape (box pill circle diamond), at: col,row.
// ---------------------------------------------------------------------------

export const DIAGRAM_HELP =
  'id: Label | detail {group: G; style: accent|dark|muted|alert; shape: pill|circle|diamond; at: col,row}  ·  a -> b: label  ·  --> dashed  ·  => bold  ·  <-> both ways  ·  direction: right|down'

type Diagram = BlockOf<'diagram'>

const EDGE = /^([\w.-]+)\s*(<-->|<->|<=>|-->|->|=>)\s*([\w.-]+)\s*(?::\s*(.*))?$/
const NODE = /^([\w.-]+)\s*:\s*(.*)$/
const STYLES = ['default', 'accent', 'dark', 'muted', 'alert'] as const
const SHAPES = ['box', 'pill', 'circle', 'diamond'] as const

export function diagramToText(d: Diagram): string {
  const lines = [`direction: ${d.direction ?? 'right'}`]
  for (const n of d.nodes) {
    const opts: string[] = []
    if (n.group) opts.push(`group: ${n.group}`)
    if (n.style && n.style !== 'default') opts.push(`style: ${n.style}`)
    if (n.shape && n.shape !== 'box') opts.push(`shape: ${n.shape}`)
    if (n.col !== undefined || n.row !== undefined) opts.push(`at: ${n.col ?? ''},${n.row ?? ''}`)
    lines.push(`${n.id}: ${n.label}${n.text ? ` | ${n.text}` : ''}${opts.length ? ` {${opts.join('; ')}}` : ''}`)
  }
  for (const e of d.edges) {
    const arrow = e.style === 'dashed' ? (e.both ? '<-->' : '-->') : e.style === 'bold' ? (e.both ? '<=>' : '=>') : e.both ? '<->' : '->'
    lines.push(`${e.from} ${arrow} ${e.to}${e.label ? `: ${e.label}` : ''}`)
  }
  return lines.join('\n')
}

/** Parses the text form. Unknown lines are reported, never thrown. */
export function textToDiagram(src: string): { direction: Diagram['direction']; nodes: DiagramNode[]; edges: DiagramEdge[]; errors: string[] } {
  let direction: Diagram['direction'] = 'right'
  const nodes: DiagramNode[] = []
  const edges: DiagramEdge[] = []
  const errors: string[] = []
  const seen = new Set<string>()
  src.split('\n').forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('//') || line.startsWith('#')) return
    const dir = /^direction\s*:\s*(right|down)\s*$/i.exec(line)
    if (dir) {
      direction = dir[1].toLowerCase() as 'right' | 'down'
      return
    }
    const e = EDGE.exec(line)
    if (e) {
      const op = e[2]
      edges.push({
        from: e[1],
        to: e[3],
        label: e[4]?.trim() || undefined,
        style: op.includes('--') ? 'dashed' : op.includes('=') ? 'bold' : undefined,
        both: op.startsWith('<') || undefined
      })
      return
    }
    const n = NODE.exec(line)
    if (n) {
      let rest = n[2]
      const node: DiagramNode = { id: n[1], label: '' }
      const opt = /\{([^}]*)\}\s*$/.exec(rest)
      if (opt) {
        rest = rest.slice(0, opt.index)
        for (const part of opt[1].split(';')) {
          const [k, ...v] = part.split(':')
          const key = k.trim().toLowerCase()
          const val = v.join(':').trim()
          if (key === 'group' && val) node.group = val
          else if (key === 'style' && (STYLES as readonly string[]).includes(val)) node.style = val as DiagramNode['style']
          else if (key === 'shape' && (SHAPES as readonly string[]).includes(val)) node.shape = val as DiagramNode['shape']
          else if (key === 'at') {
            const [c, r] = val.split(',').map((x) => x.trim())
            if (c !== '' && Number.isInteger(+c) && +c >= 0) node.col = +c
            if (r !== undefined && r !== '' && Number.isInteger(+r) && +r >= 0) node.row = +r
          } else if (key) errors.push(`Line ${i + 1}: unknown option “${key}”`)
        }
      }
      const [label, ...detail] = rest.split('|')
      node.label = label.trim() || node.id
      const t = detail.join('|').trim()
      if (t) node.text = t
      if (seen.has(node.id)) errors.push(`Line ${i + 1}: “${node.id}” is defined twice`)
      seen.add(node.id)
      nodes.push(node)
      return
    }
    errors.push(`Line ${i + 1}: not a box (id: Label) or an arrow (a -> b)`)
  })
  // arrows may mention boxes that were never declared: create them
  for (const e of edges)
    for (const id of [e.from, e.to])
      if (!seen.has(id)) {
        seen.add(id)
        nodes.push({ id, label: id })
      }
  return { direction, nodes, edges, errors }
}
