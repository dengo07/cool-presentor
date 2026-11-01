import { memo, useMemo } from 'react'
import { type El, fillToCss, rgba, type Run, type Scene, SLIDE_H, SLIDE_W, type TextEl } from '@core/scene'
import { LINE_BOX } from '@core/measure'
import { iconSvg } from '@core/icons'
import { ChartView } from './ChartView'

// 96 px per inch "design" resolution; the whole slide is CSS-scaled to fit.
const PX = 96
const PT = PX / 72

interface Props {
  scene: Scene
  width: number
  /** Animate elements with matching ids between scenes (Morph preview). */
  animate?: boolean
  onPick?: (elementId: string) => void
  className?: string
}

export const SceneView = memo(function SceneView({ scene, width, animate, onPick, className }: Props) {
  const scale = width / (SLIDE_W * PX)
  return (
    <div
      className={'scene ' + (className ?? '')}
      style={{ width, height: width * (SLIDE_H / SLIDE_W), background: '#' + scene.bg }}
    >
      <div
        className={animate ? 'scene-inner animate' : 'scene-inner'}
        style={{ width: SLIDE_W * PX, height: SLIDE_H * PX, transform: `scale(${scale})` }}
      >
        {scene.elements.map((el) => (
          <ElView key={el.id} el={el} onPick={onPick} />
        ))}
      </div>
    </div>
  )
})

function box(el: El): React.CSSProperties {
  return {
    left: el.x * PX,
    top: el.y * PX,
    width: el.w * PX,
    height: el.h * PX,
    transform: el.rotate ? `rotate(${el.rotate}deg)` : undefined
  }
}

const ElView = memo(function ElView({ el, onPick }: { el: El; onPick?: (id: string) => void }) {
  const pick = onPick
    ? (e: React.MouseEvent): void => {
        e.stopPropagation()
        onPick(el.id)
      }
    : undefined
  const pickable = onPick && !el.id.startsWith('deco') && el.id !== 'bg' && el.id !== 'scrim'

  switch (el.kind) {
    case 'shape': {
      if (el.shape === 'line') {
        const horiz = el.h === 0
        const w = (el.line?.width ?? 1) * PT
        return (
          <div
            className="el"
            style={{
              ...box(el),
              height: horiz ? 0 : el.h * PX,
              width: horiz ? el.w * PX : 0,
              borderTop: horiz ? `${w}px solid ${rgba(el.line!.color, el.line!.alpha ?? 1)}` : undefined,
              borderLeft: horiz ? undefined : `${w}px solid ${rgba(el.line!.color, el.line!.alpha ?? 1)}`,
              marginTop: horiz ? -w / 2 : 0,
              marginLeft: horiz ? 0 : -w / 2
            }}
          />
        )
      }
      const s = el.shadow
      return (
        <div
          className="el"
          onMouseDown={pickable ? pick : undefined}
          style={{
            ...box(el),
            background: el.fill ? fillToCss(el.fill) : undefined,
            border: el.line ? `${el.line.width * PT}px solid ${rgba(el.line.color, el.line.alpha ?? 1)}` : undefined,
            boxSizing: 'border-box',
            borderRadius: el.shape === 'ellipse' ? '50%' : el.shape === 'roundRect' ? (el.radius ?? 0) * PX : 0,
            boxShadow: s ? `0 ${s.offset * PT}px ${s.blur * PT}px ${rgba(s.color, s.alpha)}` : undefined
          }}
        />
      )
    }
    case 'text':
      return <TextView el={el} onPick={pickable ? pick : undefined} />
    case 'image':
      return (
        <div
          className="el"
          onMouseDown={pickable ? pick : undefined}
          style={{ ...box(el), overflow: 'hidden', borderRadius: el.circle ? '50%' : (el.radius ?? 0) * PX }}
        >
          <img
            src={el.src}
            draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${el.focusX * 100}% ${el.focusY * 100}%`, display: 'block' }}
          />
        </div>
      )
    case 'icon':
      return <IconView el={el} />
    case 'chart':
      return (
        <div className="el" onMouseDown={pickable ? pick : undefined} style={box(el)}>
          <ChartView el={el} />
        </div>
      )
  }
})

function IconView({ el }: { el: Extract<El, { kind: 'icon' }> }): React.JSX.Element {
  const html = useMemo(() => iconSvg(el.icon, el.color, el.stroke, el.w * PX), [el.icon, el.color, el.stroke, el.w])
  return <div className="el icon" style={box(el)} dangerouslySetInnerHTML={{ __html: html }} />
}

function runStyle(r: Run, el: TextEl): React.CSSProperties {
  const st: React.CSSProperties = {}
  if (r.bold !== undefined && r.bold !== el.bold) st.fontWeight = r.bold ? 700 : 400
  if (r.italic) st.fontStyle = 'italic'
  if (r.fill && r.fill.kind !== 'solid') {
    st.backgroundImage = fillToCss(r.fill)
    st.WebkitBackgroundClip = 'text'
    st.backgroundClip = 'text'
    st.color = 'transparent'
    // gradients look best when they span the inline box
    st.WebkitBoxDecorationBreak = 'clone'
  } else if (r.color) st.color = '#' + r.color
  return st
}

const TextView = memo(function TextView({ el, onPick }: { el: TextEl; onPick?: (e: React.MouseEvent) => void }) {
  return (
    <div
      className="el text"
      onMouseDown={onPick}
      style={{
        ...box(el),
        display: 'flex',
        flexDirection: 'column',
        justifyContent: el.valign === 'middle' ? 'center' : el.valign === 'bottom' ? 'flex-end' : 'flex-start',
        fontFamily: `"${el.font}"`,
        fontSize: el.size * PT,
        fontWeight: el.bold ? 700 : 400,
        fontStyle: el.italic ? 'italic' : undefined,
        color: '#' + el.color,
        lineHeight: el.lineHeight * LINE_BOX,
        letterSpacing: el.tracking ? el.tracking * PT : undefined,
        textAlign: el.align,
        textTransform: el.upper ? 'uppercase' : undefined
      }}
    >
      {el.paras.map((p, i) => (
        <div
          key={i}
          style={{
            paddingLeft: p.bullet ? p.bullet.indent * PX : 0,
            textIndent: p.bullet ? -p.bullet.indent * PX : 0,
            marginTop: p.spaceBefore ? p.spaceBefore * PT : 0
          }}
        >
          {p.bullet && <span style={{ display: 'inline-block', width: p.bullet.indent * PX, textIndent: 0, color: '#' + p.bullet.color }}>{p.bullet.char}</span>}
          {p.runs.map((r, j) => (
            <span key={j} style={runStyle(r, el)}>
              {r.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
})
