import { describe, expect, it } from 'vitest'
import { placeNodes } from '../src/core/layout/diagram'
import { diagramToText, textToDiagram } from '../src/core/diagram-text'
import { type BlockOf, newBlock, newSlide, type Deck } from '../src/core/model'
import { buildDeck } from '../src/core/layout/engine'
import { heuristicMeasurer } from '../src/core/measure'
import type { ShapeEl } from '../src/core/scene'

type Diagram = BlockOf<'diagram'>
const diagram = (src: string): Diagram => ({ id: 'd1', type: 'diagram', ...textToDiagram(src) })

describe('diagram placement', () => {
  it('lays a chain out left to right and breaks cycles', () => {
    const pos = placeNodes(diagram('a -> b\nb -> c\nc -> a: back'))
    expect([pos.get('a'), pos.get('b'), pos.get('c')]).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 }
    ])
  })

  it('stacks along rows when the direction is down', () => {
    const pos = placeNodes(diagram('direction: down\na -> b\na -> c'))
    expect(pos.get('a')!.row).toBe(0)
    expect(pos.get('b')!.row).toBe(1)
    expect(pos.get('c')!.row).toBe(1)
    expect(pos.get('b')!.col).not.toBe(pos.get('c')!.col)
  })

  it('never puts two nodes in the same cell and honours pins', () => {
    const d = diagram(
      ['x: X {at: 2,0}', 'a -> b', 'a -> c', 'a -> d', 'b -> e', 'c -> e', 'd -> e', 'e -> x'].join('\n')
    )
    const pos = placeNodes(d)
    const cells = [...pos.values()].map((p) => `${p.col},${p.row}`)
    expect(new Set(cells).size).toBe(cells.length)
    expect(pos.get('x')).toEqual({ col: 2, row: 0 })
  })

  it('keeps group members next to each other', () => {
    const d = diagram(['direction: down', 'top: Top', 'p: P {group: G1}', 'q: Q {group: G2}', 'r: R {group: G1}', 'top -> p', 'top -> q', 'top -> r'].join('\n'))
    const pos = placeNodes(d)
    expect(Math.abs(pos.get('p')!.col - pos.get('r')!.col)).toBe(1)
  })
})

describe('diagram text form', () => {
  it('round-trips nodes, options and arrow styles', () => {
    const src = [
      'direction: down',
      'pi: Raspberry Pi 5 | Vision, ROS 2 {group: Vehicle; style: dark; at: 0,1}',
      'esp: ESP32 {shape: pill}',
      'pi -> esp: UART · CRC',
      'esp --> pi',
      'pi <=> esp: both'
    ].join('\n')
    const d = diagram(src)
    expect(d.direction).toBe('down')
    expect(d.nodes[0]).toEqual({ id: 'pi', label: 'Raspberry Pi 5', text: 'Vision, ROS 2', group: 'Vehicle', style: 'dark', col: 0, row: 1 })
    expect(d.edges).toEqual([
      { from: 'pi', to: 'esp', label: 'UART · CRC', style: undefined, both: undefined },
      { from: 'esp', to: 'pi', label: undefined, style: 'dashed', both: undefined },
      { from: 'pi', to: 'esp', label: 'both', style: 'bold', both: true }
    ])
    expect(textToDiagram(diagramToText(d))).toMatchObject({ direction: d.direction, nodes: d.nodes, edges: d.edges, errors: [] })
  })

  it('creates boxes for arrows to undeclared ids and reports junk lines', () => {
    const r = textToDiagram('a -> b\nthis is not valid')
    expect(r.nodes.map((n) => n.id)).toEqual(['a', 'b'])
    expect(r.errors).toHaveLength(1)
  })
})

describe('diagram rendering', () => {
  const deckWith = (d: Diagram): Deck => {
    const s = newSlide([{ ...newBlock('title'), text: 'Architecture' } as never, d])
    return { version: 1, title: 'x', themeId: 'paper', slides: [newSlide(), s] }
  }

  it('draws every node and an arrowhead per edge, inside the slide', () => {
    const d = diagram(['gs: Ground station {group: Base}', 'v: Vehicle', 'gs <-> v: nRF24', 'v --> gs: 4G', 'v -> cam: video'].join('\n'))
    const scene = buildDeck(deckWith(d), heuristicMeasurer)[1]
    expect(scene.layoutId).toBe('diagram')
    const nodes = scene.elements.filter((e) => e.id.startsWith('d1-n-'))
    expect(nodes).toHaveLength(3)
    const lines = scene.elements.filter((e): e is ShapeEl => e.kind === 'shape' && e.shape === 'line' && e.id.startsWith('d1-e'))
    expect(lines.filter((l) => l.arrow?.end)).toHaveLength(3)
    expect(lines.filter((l) => l.arrow?.start)).toHaveLength(1)
    for (const e of scene.elements.filter((e) => e.id.startsWith('d1-')))
      for (const [x, y] of [
        [e.x, e.y],
        [e.x + e.w, e.y + e.h]
      ]) {
        expect(x).toBeGreaterThanOrEqual(-0.01)
        expect(x).toBeLessThanOrEqual(13.34)
        expect(y).toBeGreaterThanOrEqual(-0.01)
        expect(y).toBeLessThanOrEqual(7.51)
      }
  })

  it('routes a back edge around the boxes in between', () => {
    const scene = buildDeck(deckWith(diagram('a -> b\nb -> c\nc -> a')), heuristicMeasurer)[1]
    const b = scene.elements.find((e) => e.id === 'd1-n-b')!
    const back = scene.elements.filter((e) => e.id.startsWith('d1-e2-'))
    expect(back.length).toBe(3)
    // the horizontal part runs below box b
    const flat = back.find((e) => e.h === 0)!
    expect(flat.y).toBeGreaterThan(b.y + b.h)
  })
})
