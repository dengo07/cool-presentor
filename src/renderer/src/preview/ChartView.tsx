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
  const legendH = multi || isPie ? fs * 2.4 : 0

  if (isPie) {
    const vals = el.series[0]?.values ?? []
    const total = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1
    const r = Math.min(W, H - legendH) / 2 - 8
    const cx = W / 2
    const cy = (H - legendH) / 2
    const inner = el.chartKind === 'donut' ? r * 0.62 : 0
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
              <path d={d} fill={'#' + el.colors[i % el.colors.length]} stroke="rgba(0,0,0,0.0)" />
              {v / total > 0.04 && (
                <text x={cx + lr * Math.cos(mid)} y={cy + lr * Math.sin(mid)} fill="#fff" textAnchor="middle" dominantBaseline="middle" fontWeight={700}>
                  {label}
                </text>
              )}
            </g>
          )
          a0 = a1
          return node
        })}
        <Legend names={el.categories} colors={el.colors} y={H - legendH / 2} W={W} fs={fs} color={text} />
      </svg>
    )
  }

  const padL = fs * 3.4
  const padB = fs * 2.2
  const padT = fs * 1.6
  const pw = W - padL - 8
  const ph = H - padB - padT - legendH
  const all = el.series.flatMap((s) => s.values)
  const max = niceMax(Math.max(0, ...all))
  const ticks = 5
  const n = el.categories.length || 1
  const horizontal = el.chartKind === 'bar'
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

  if (el.chartKind === 'column' || el.chartKind === 'bar') {
    const band = (horizontal ? ph : pw) / n
    const groupW = band / 1.55
    const bw = groupW / el.series.length
    el.categories.forEach((c, i) => {
      const start = i * band + (band - groupW) / 2
      el.series.forEach((s, k) => {
        const v = Math.max(0, s.values[i] ?? 0)
        const color = '#' + el.colors[k % el.colors.length]
        if (horizontal) {
          const y = padT + start + k * bw
          const w = (v / max) * pw
          els.push(<rect key={`b${i}-${k}`} x={padL} y={y} width={w} height={bw} fill={color} />)
          if (!multi)
            els.push(
              <text key={`v${i}`} x={padL + w + fs * 0.4} y={y + bw / 2} fill={text} dominantBaseline="middle">
                {fmt(v, el.unit)}
              </text>
            )
        } else {
          const x = padL + start + k * bw
          const y = valueToY(v)
          els.push(<rect key={`b${i}-${k}`} x={x} y={y} width={bw} height={padT + ph - y} fill={color} />)
          if (!multi)
            els.push(
              <text key={`v${i}`} x={x + bw / 2} y={y - fs * 0.5} fill={text} textAnchor="middle">
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
      const color = '#' + el.colors[k % el.colors.length]
      const pts = s.values.map((v, i) => [xAt(i), valueToY(Math.max(0, v))] as const)
      const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')
      if (el.chartKind === 'area' && pts.length)
        els.push(<path key={'a' + k} d={`${path} L${pts[pts.length - 1][0]},${padT + ph} L${pts[0][0]},${padT + ph} Z`} fill={color} opacity={0.45} />)
      els.push(<path key={'l' + k} d={path} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" />)
      if (el.chartKind === 'line') pts.forEach((p, i) => els.push(<circle key={`p${k}-${i}`} cx={p[0]} cy={p[1]} r={4.5} fill={color} />))
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
      {multi && <Legend names={el.series.map((s) => s.name)} colors={el.colors} y={H - legendH / 2} W={W} fs={fs} color={text} />}
    </svg>
  )
}

function Legend({ names, colors, y, W, fs, color }: { names: string[]; colors: string[]; y: number; W: number; fs: number; color: string }): React.JSX.Element {
  const itemW = names.map((n) => n.length * fs * 0.6 + fs * 2)
  const total = itemW.reduce((a, b) => a + b, 0)
  let x = (W - total) / 2
  return (
    <g>
      {names.map((n, i) => {
        const gx = x
        x += itemW[i]
        return (
          <g key={i}>
            <rect x={gx} y={y - fs * 0.4} width={fs * 0.8} height={fs * 0.8} fill={'#' + colors[i % colors.length]} />
            <text x={gx + fs * 1.2} y={y} fill={color} dominantBaseline="middle">
              {n}
            </text>
          </g>
        )
      })}
    </g>
  )
}
