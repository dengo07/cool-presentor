import { useMemo, useState } from 'react'
import { AlertTriangle, Check, ImageIcon, RotateCcw } from 'lucide-react'
import { deckTheme, getTheme, THEMES, type DecoStyle } from '@core/themes'
import { buildScene, resolveLayouts } from '@core/layout/engine'
import { FONTS, hasBoldFace } from '@core/fonts'
import { contrast, ensureContrast } from '@core/color'
import type { Deck } from '@core/model'
import { SceneView } from '../preview/SceneView'
import { canvasMeasurer } from '../lib/fonts'
import { BACKGROUNDS, PALETTES, paletteFromImages } from '../lib/palette'
import { useStore } from '../store'
import { useUi } from '../ui'
import { Modal } from './Modals'

export function ThemeStudio({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [tab, setTab] = useState<'themes' | 'customize'>('themes')
  return (
    <Modal title="Theme" onClose={onClose} wide>
      <div className="seg studio-tabs">
        <button className={tab === 'themes' ? 'on' : ''} onClick={() => setTab('themes')}>
          Themes
        </button>
        <button className={tab === 'customize' ? 'on' : ''} onClick={() => setTab('customize')}>
          Customize colors & fonts
        </button>
      </div>
      {tab === 'themes' ? <ThemeGrid onCustomize={() => setTab('customize')} /> : <Customize />}
    </Modal>
  )
}

function ThemeGrid({ onCustomize }: { onCustomize: () => void }): React.JSX.Element {
  const deck = useStore((s) => s.deck)
  const setTheme = useStore((s) => s.setTheme)
  const current = useStore((s) => s.current)
  const previews = useMemo(() => {
    const layouts = resolveLayouts(deck)
    const idx = [...new Set([0, current])]
    return THEMES.map((t) => ({
      theme: t,
      scenes: idx.map((i) => buildScene(deck.slides[i], i, deck.slides.length, layouts[i], deck.themeId === t.id ? deckTheme(deck) : t, canvasMeasurer))
    }))
  }, [deck, current])

  return (
    <>
      {deck.custom && (
        <div className="callout">
          Your deck has custom colors or fonts. Picking another theme starts fresh (Ctrl+Z undoes it).
          <button className="link" onClick={onCustomize}>
            Edit customizations
          </button>
        </div>
      )}
      <div className="theme-grid">
        {previews.map(({ theme, scenes }) => (
          <button
            key={theme.id}
            className={'theme-card' + (deck.themeId === theme.id ? ' on' : '')}
            onClick={() => deck.themeId !== theme.id && setTheme(theme.id)}
          >
            <div className="theme-previews">
              {scenes.map((sc, i) => (
                <SceneView key={i} scene={sc} width={i === 0 ? 256 : 112} />
              ))}
            </div>
            <div className="theme-meta">
              <strong>
                {theme.name}
                {deck.themeId === theme.id && deck.custom ? ' · customized' : ''}
              </strong>
              <span>{theme.tagline}</span>
              {deck.themeId === theme.id && <Check size={16} className="theme-check" />}
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

const DECOS: { id: DecoStyle; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'aurora', label: 'Glow' },
  { id: 'orbs', label: 'Orbs' },
  { id: 'grid', label: 'Rings' },
  { id: 'lines', label: 'Lines' },
  { id: 'blocks', label: 'Blocks' }
]

function imageSources(deck: Deck): string[] {
  return deck.slides.flatMap((s) => s.blocks.flatMap((b) => (b.type === 'image' && b.src ? [b.src] : [])))
}

function ColorField({ label, value, onChange, auto }: { label: string; value: string; onChange: (hex: string) => void; auto?: () => void }): React.JSX.Element {
  return (
    <label className="color-field">
      <input type="color" value={'#' + value.toLowerCase()} onChange={(e) => onChange(e.target.value.slice(1).toUpperCase())} />
      <span>{label}</span>
      <code>#{value}</code>
      {auto && (
        <button className="link small" onClick={(e) => (e.preventDefault(), auto())}>
          Auto
        </button>
      )}
    </label>
  )
}

function Customize(): React.JSX.Element {
  const deck = useStore((s) => s.deck)
  const current = useStore((s) => s.current)
  const set = useStore((s) => s.setCustom)
  const reset = useStore((s) => s.resetCustom)
  const theme = useMemo(() => deckTheme(deck), [deck])
  const base = getTheme(deck.themeId)
  const c = deck.custom ?? {}
  const images = useMemo(() => imageSources(deck), [deck])

  const previews = useMemo(() => {
    const layouts = resolveLayouts(deck)
    const pick = [...new Set([current, 0, layouts.findIndex((l) => l === 'stats' || l === 'chart-takeaway' || l === 'features')])].filter((i) => i >= 0)
    return pick.slice(0, 3).map((i) => buildScene(deck.slides[i], i, deck.slides.length, layouts[i], theme, canvasMeasurer))
  }, [deck, current, theme])

  const fromPhotos = async (): Promise<void> => {
    const p = await paletteFromImages(images)
    // photo colours are adjusted so they stay readable on the current background
    if (p) set({ accents: p.map((col) => ensureContrast(col, theme.bgColor, 3)) as [string, string, string] })
    else useUi.getState().toast({ text: 'Could not find vivid colors in your photos' })
  }

  const lowAccent = contrast(theme.accents[0], theme.bgColor) < 3
  const lowText = contrast(theme.text, theme.bgColor) < 4.5
  const accents = theme.accents

  return (
    <div className="studio">
      <div className="studio-controls">
        <section>
          <h4>Background</h4>
          <div className="swatches">
            {BACKGROUNDS.map((bg) => (
              <button key={bg} className={'swatch' + (theme.bgColor === bg ? ' on' : '')} style={{ background: '#' + bg }} title={'#' + bg} onClick={() => set({ bg })} />
            ))}
          </div>
          <ColorField label="Custom" value={theme.bgColor} onChange={(bg) => set({ bg })} />
          <label className="check">
            <input type="checkbox" checked={theme.bg.kind !== 'solid'} onChange={(e) => set({ bgGradient: e.target.checked })} /> Soft gradient
          </label>
        </section>

        <section>
          <h4>Accent colors</h4>
          <div className="palettes">
            {PALETTES.map((p) => (
              <button key={p.name} className="palette" title={p.name} onClick={() => set({ accents: p.colors })}>
                {p.colors.map((col) => (
                  <i key={col} style={{ background: '#' + col }} />
                ))}
                <span>{p.name}</span>
              </button>
            ))}
            <button className="palette photo" disabled={!images.length} onClick={fromPhotos} title={images.length ? 'Pick colors from your photos' : 'Add photos to your deck first'}>
              <ImageIcon size={14} />
              <span>From my photos</span>
            </button>
          </div>
          {[0, 1, 2].map((i) => (
            <ColorField
              key={i}
              label={i === 0 ? 'Accent 1 · highlights' : i === 1 ? 'Accent 2' : 'Accent 3'}
              value={accents[i]}
              onChange={(hex) => {
                const next = [...accents] as [string, string, string]
                next[i] = hex
                set({ accents: next })
              }}
            />
          ))}
          {lowAccent && (
            <p className="warn">
              <AlertTriangle size={13} /> Accent 1 is hard to read on this background.
            </p>
          )}
        </section>

        <section>
          <h4>Text</h4>
          <ColorField label="Text color" value={theme.text} onChange={(text) => set({ text })} auto={c.text ? () => set({ text: undefined }) : undefined} />
          {lowText && (
            <p className="warn">
              <AlertTriangle size={13} /> Low contrast – text may be hard to read.
            </p>
          )}
        </section>

        <section>
          <h4>Heading font</h4>
          <div className="font-grid">
            {Object.keys(FONTS).map((f) => (
              <button key={f} className={'font-chip' + (theme.heading.font === f ? ' on' : '')} style={{ fontFamily: `"${f}"` }} onClick={() => set({ headingFont: f })}>
                <b style={{ fontWeight: theme.heading.bold && hasBoldFace(f) ? 700 : 400 }}>Aa</b> {f}
              </button>
            ))}
          </div>
          <div className="seg small">
            <button className={!theme.heading.bold ? 'on' : ''} onClick={() => set({ headingBold: false })}>
              Regular
            </button>
            <button className={theme.heading.bold ? 'on' : ''} disabled={!hasBoldFace(theme.heading.font)} onClick={() => set({ headingBold: true })}>
              Bold
            </button>
          </div>
        </section>

        <section>
          <h4>Body font</h4>
          <div className="font-grid">
            {Object.keys(FONTS).map((f) => (
              <button key={f} className={'font-chip' + (theme.body.font === f ? ' on' : '')} style={{ fontFamily: `"${f}"` }} onClick={() => set({ bodyFont: f })}>
                Aa {f}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h4>Shape & decoration</h4>
          <label className="slider">
            Corner radius
            <input type="range" min={0} max={0.5} step={0.02} value={theme.radius} onChange={(e) => set({ radius: +e.target.value })} />
          </label>
          <div className="seg small wrap">
            {DECOS.map((d) => (
              <button key={d.id} className={theme.deco === d.id ? 'on' : ''} onClick={() => set({ deco: d.id })}>
                {d.label}
              </button>
            ))}
          </div>
        </section>

        <button className="btn sm" disabled={!deck.custom} onClick={reset}>
          <RotateCcw size={14} /> Reset to {base.name}
        </button>
      </div>

      <div className="studio-preview">
        {previews.map((sc, i) => (
          <SceneView key={i} scene={sc} width={i === 0 ? 620 : 300} animate className="studio-slide" />
        ))}
      </div>
    </div>
  )
}
