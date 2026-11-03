import type { ChartEl } from '@core/scene'
import { rgba } from '@core/scene'

// Lightweight SVG rendering of the same data PowerPoint gets as a native chart.
const PX = 96

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * p
}

function fmt(v: number, unit?: string): string {
  const s = Math.abs(v) >= 1000 ? v.toLocaleString('en-US') : String(Math.round(v * 100) / 100)
  return unit ? s + unit : s
}

export function ChartView({ el }: { el: ChartEl }): React.JSX.Element {
  const W = el.w * PX
  const H = el.h * PX
  const fs = (el.fontSize * PX) / 72
  const font = `"${el.font}"`
  const text = '#' + el.textColor
  const multi = el.series.length > 1
  const isPie = el.chartKind === 'pie' || el.chartKind === 'donut'
  const color = (i: number): string => '#' + el.colors[i % el.colors.length]

  if (isPie) return <PieView el={el} W={W} H={H} fs={fs} font={font} text={text} />
  if (el.chartKind === 'radar') return <RadarView el={el} W={W} H={H} fs={fs} font={font} text={text} />

  const legendH = multi ? fs * 2.4 : 0
  const padL = fs * 3.4
  const padB = fs * 2.2
  const padT = fs * 1.6
  const pw = W - padL - 8
  const ph = H - padB - padT - legendH
  const stacked = el.chartKind === 'stacked-column' || el.chartKind === 'stacked-bar'
  const horizontal = el.chartKind === 'bar' || el.chartKind === 'stacked-bar'
  const n = el.categories.length || 1
  const sums = el.categories.map((_, i) => el.series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0))
  const max = niceMax(stacked ? Math.max(0, ...sums) : Math.max(0, ...el.series.flatMap((s) => s.values)))
  const ticks = 5
  const grid = rgba(el.gridColor, 1)
  const valueToY = (v: number): number => padT + ph - (v / max) * ph
  const els: React.JSX.Element[] = []

  // grid + value axis labels
  for (let t = 0; t <= ticks; t++) {
    const v = (max / ticks) * t
    if (horizontal) {
      const x = padL + (v / max) * pw
      els.push(<line key={'g' + t} x1={x} x2={x} y1={padT} y2={padT + ph} stroke={grid} strokeWidth={1} />)
      els.push(
        <text key={'gl' + t} x={x} y={padT + ph + fs * 1.3} fill={text} textAnchor="middle">
          {fmt(v, el.unit)}
        </text>
      )
    } else {
      const y = valueToY(v)
      els.push(<line key={'g' + t} x1={padL} x2={padL + pw} y1={y} y2={y} stroke={grid} strokeWidth={1} />)
      els.push(
        <text key={'gl' + t} x={padL - fs * 0.6} y={y} fill={text} textAnchor="end" dominantBaseline="middle">
          {fmt(v, el.unit)}
        </text>
      )
    }
  }

  if (el.chartKind !== 'line' && el.chartKind !== 'area') {
    const band = (horizontal ? ph : pw) / n
    const groupW = band / (stacked ? 1.45 : 1.55)
    const bw = stacked ? groupW : groupW / el.series.length
    el.categories.forEach((c, i) => {
      const start = i * band + (band - groupW) / 2
      let acc = 0
      el.series.forEach((s, k) => {
        const v = Math.max(0, s.values[i] ?? 0)
        const off = stacked ? acc : 0
        acc += v
        const fill = multi ? color(k) : color(0)
        if (horizontal) {
          const y = padT + start + (stacked ? 0 : k * bw)
          const x = padL + (off / max) * pw
          const w = (v / max) * pw
          els.push(<rect key={`b${i}-${k}`} x={x} y={y} width={w} height={bw} fill={fill} />)
          if (!multi)
            els.push(
              <text key={`v${i}`} x={x + w + fs * 0.4} y={y + bw / 2} fill={text} dominantBaseline="middle">
                {fmt(v, el.unit)}
              </text>
            )
        } else {
          const x = padL + start + (stacked ? 0 : k * bw)
          const top = valueToY(off + v)
          els.push(<rect key={`b${i}-${k}`} x={x} y={top} width={bw} height={valueToY(off) - top} fill={fill} />)
          if (!multi)
            els.push(
              <text key={`v${i}`} x={x + bw / 2} y={top - fs * 0.5} fill={text} textAnchor="middle">
                {fmt(v, el.unit)}
              </text>
            )
        }
      })
      els.push(
        horizontal ? (
          <text key={'c' + i} x={padL - fs * 0.6} y={padT + i * band + band / 2} fill={text} textAnchor="end" dominantBaseline="middle">
            {c}
          </text>
        ) : (
          <text key={'c' + i} x={padL + i * band + band / 2} y={padT + ph + fs * 1.3} fill={text} textAnchor="middle">
            {c}
          </text>
        )
      )
    })
  } else {
    // line / area
    const step = n > 1 ? pw / n : pw
    const xAt = (i: number): number => padL + step * i + step / 2
    el.series.forEach((s, k) => {
      const pts = s.values.map((v, i) => [xAt(i), valueToY(Math.max(0, v))] as const)
      const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')
      if (el.chartKind === 'area' && pts.length)
        els.push(<path key={'a' + k} d={`${path} L${pts[pts.length - 1][0]},${padT + ph} L${pts[0][0]},${padT + ph} Z`} fill={color(k)} opacity={0.45} />)
      els.push(<path key={'l' + k} d={path} fill="none" stroke={color(k)} strokeWidth={3} strokeLinejoin="round" />)
      if (el.chartKind === 'line') pts.forEach((p, i) => els.push(<circle key={`p${k}-${i}`} cx={p[0]} cy={p[1]} r={4.5} fill={color(k)} />))
    })
    el.categories.forEach((c, i) =>
      els.push(
        <text key={'c' + i} x={xAt(i)} y={padT + ph + fs * 1.3} fill={text} textAnchor="middle">
          {c}
        </text>
      )
    )
  }

  return (
    <svg width={W} height={H} style={{ fontFamily: font, fontSize: fs, overflow: 'visible' }}>
      {els}
      {multi && <Legend names={el.series.map((s) => s.name)} colors={el.colors} x={0} y={H - legendH / 2} W={W} fs={fs} color={text} />}
    </svg>
  )
}

interface SubProps {
  el: ChartEl
  W: number
  H: number
  fs: number
  font: string
  text: string
}

function PieView({ el, W, H, fs, font, text }: SubProps): React.JSX.Element {
  const vals = el.series[0]?.values ?? []
  const total = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1
  // many slices → legend on the right (like the exported PowerPoint chart)
  const side = el.categories.length > 5
  const legendH = side ? 0 : fs * 2.4
  const legendW = side ? Math.min(W * 0.4, Math.max(...el.categories.map((c) => c.length)) * fs * 0.6 + fs * 2.4) : 0
  const r = Math.min(W - legendW, H - legendH) / 2 - 8
  const cx = (W - legendW) / 2
  const cy = (H - legendH) / 2
  const inner = el.chartKind === 'donut' ? r * 0.62 : 0
  const labelFill = '#' + (el.labelColor ?? 'FFFFFF')
  let a0 = -Math.PI / 2
  return (
    <svg width={W} height={H} style={{ fontFamily: font, fontSize: fs }}>
      {vals.map((v, i) => {
        const a1 = a0 + (Math.max(0, v) / total) * Math.PI * 2
        const large = a1 - a0 > Math.PI ? 1 : 0
        const p = (rad: number, a: number): string => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`
        const d = inner
          ? `M${p(r, a0)} A${r},${r} 0 ${large} 1 ${p(r, a1)} L${p(inner, a1)} A${inner},${inner} 0 ${large} 0 ${p(inner, a0)} Z`
          : `M${cx},${cy} L${p(r, a0)} A${r},${r} 0 ${large} 1 ${p(r, a1)} Z`
        const mid = (a0 + a1) / 2
        const lr = inner ? (r + inner) / 2 : r * 0.65
        const label = el.unit ? fmt(v, el.unit) : `${Math.round((v / total) * 100)}%`
        const node = (
          <g key={i}>
            <path d={d} fill={'#' + el.colors[i % el.colors.length]} stroke={'#' + el.textColor} strokeOpacity={0} />
            {v / total > 0.04 && (
              <text x={cx + lr * Math.cos(mid)} y={cy + lr * Math.sin(mid)} fill={labelFill} textAnchor="middle" dominantBaseline="middle" fontWeight={700}>
                {label}
              </text>
            )}
          </g>
        )
        a0 = a1
        return node
      })}
      {side ? (
        <Legend names={el.categories} colors={el.colors} x={W - legendW} y={0} W={legendW} H={H} fs={fs} color={text} vertical />
      ) : (
        <Legend names={el.categories} colors={el.colors} x={0} y={H - legendH / 2} W={W} fs={fs} color={text} />
      )}
    </svg>
  )
}

function RadarView({ el, W, H, fs, font, text }: SubProps): React.JSX.Element {
  const multi = el.series.length > 1
  const legendH = multi ? fs * 2.4 : 0
  const n = Math.max(3, el.categories.length)
  const r = Math.min(W, H - legendH) / 2 - fs * 3
  const cx = W / 2
  const cy = (H - legendH) / 2
  const max = niceMax(Math.max(0, ...el.series.flatMap((s) => s.values)))
  const at = (i: number, k: number): [number, number] => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2
    return [cx + r * k * Math.cos(a), cy + r * k * Math.sin(a)]
  }
  const ring = (k: number): string => Array.from({ length: n }, (_, i) => at(i, k).join(',')).join(' ')
  return (
    <svg width={W} height={H} style={{ fontFamily: font, fontSize: fs, overflow: 'visible' }}>
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon key={k} points={ring(k)} fill="none" stroke={rgba(el.gridColor, 1)} strokeWidth={1} />
      ))}
      {el.categories.map((c, i) => {
        const [x, y] = at(i, 1)
        const [lx, ly] = at(i, 1.14)
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke={rgba(el.gridColor, 1)} strokeWidth={1} />
            <text x={lx} y={ly} fill={text} textAnchor={Math.abs(lx - cx) < 4 ? 'middle' : lx > cx ? 'start' : 'end'} dominantBaseline="middle">
              {c}
            </text>
          </g>
        )
      })}
      {el.series.map((s, k) => {
        const pts = el.categories.map((_, i) => at(i, Math.max(0, s.values[i] ?? 0) / max))
        const c = '#' + el.colors[k % el.colors.length]
        return (
          <g key={k}>
            <polygon points={pts.map((p) => p.join(',')).join(' ')} fill={c} fillOpacity={0.18} stroke={c} strokeWidth={2.5} strokeLinejoin="round" />
            {pts.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r={4} fill={c} />
            ))}
          </g>
        )
      })}
      {multi && <Legend names={el.series.map((s) => s.name)} colors={el.colors} x={0} y={H - legendH / 2} W={W} fs={fs} color={text} />}
    </svg>
  )
}

interface LegendProps {
  names: string[]
  colors: string[]
  x: number
  y: number
  W: number
  H?: number
  fs: number
  color: string
  vertical?: boolean
}

/** Bottom legend (centred, wraps onto a second row) or a vertical legend on the right. */
function Legend({ names, colors, x, y, W, H = 0, fs, color, vertical }: LegendProps): React.JSX.Element {
  const swatch = (i: number, gx: number, gy: number): React.JSX.Element => (
    <g key={i}>
      <rect x={gx} y={gy - fs * 0.4} width={fs * 0.8} height={fs * 0.8} fill={'#' + colors[i % colors.length]} />
      <text x={gx + fs * 1.2} y={gy} fill={color} dominantBaseline="middle">
        {names[i]}
      </text>
    </g>
  )
  if (vertical) {
    const lh = Math.min(fs * 1.7, H / Math.max(1, names.length))
    const top = y + (H - lh * names.length) / 2 + lh / 2
    return <g>{names.map((_, i) => swatch(i, x + fs * 0.6, top + i * lh))}</g>
  }
  const itemW = names.map((n) => n.length * fs * 0.6 + fs * 2)
  const rows: number[][] = [[]]
  let used = 0
  itemW.forEach((w, i) => {
    if (used + w > W && rows[rows.length - 1].length) {
      rows.push([])
      used = 0
    }
    rows[rows.length - 1].push(i)
    used += w
  })
  return (
    <g>
      {rows.map((row, r) => {
        let gx = x + (W - row.reduce((a, i) => a + itemW[i], 0)) / 2
        const gy = y + (r - (rows.length - 1) / 2) * fs * 1.5
        return row.map((i) => {
          const node = swatch(i, gx, gy)
          gx += itemW[i]
          return node
        })
      })}
    </g>
  )
}
