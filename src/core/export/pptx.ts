import PptxGenJS from 'pptxgenjs'
import JSZip from 'jszip'
import PPTXEmbedFonts from 'pptx-embed-fonts'
import type { Deck } from '../model'
import type { ChartEl, Fill, ImageEl, Scene, ShapeEl, TextEl } from '../scene'
import { iconSvg, svgDataUrl } from '../icons'
import { type FontLoader, hasBoldFace, FONTS } from '../fonts'
import { BOLD_SUFFIX, mergeBoldFonts, patchSlideXml, type SlidePatches } from './postprocess'

export interface ExportOptions {
  /** Loads font files for embedding. Omit to skip embedding. */
  loadFont?: FontLoader
  /** Optional icon rasteriser (returns PNG data URL). Default embeds SVG. */
  rasterizeIcon?: (svg: string, px: number) => Promise<string>
  author?: string
}

type Props = Record<string, unknown>

/** Exports scenes to a .pptx. Returns the file bytes. */
export async function exportPptx(deck: Deck, scenes: Scene[], opts: ExportOptions = {}): Promise<Uint8Array> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE' // 13.333 x 7.5 in
  pptx.title = deck.title
  pptx.author = opts.author ?? 'Cool Presentor'
  pptx.company = 'Made with Cool Presentor'

  // Gradients are emitted as unique "sentinel" solid colours, then swapped
  // for real <a:gradFill> in post-processing.
  const gradients = new Map<string, Fill>()
  const usedColors = collectColors(scenes)
  let gid = 1
  const nextSentinel = (): string => {
    for (;;) {
      const key = (SENTINEL_PREFIX + (gid++).toString(16).padStart(4, '0')).toUpperCase()
      if (!usedColors.has(key)) return key
    }
  }
  const paint = (f: Fill | undefined): { color: string; transparency?: number } | undefined => {
    if (!f) return undefined
    if (f.kind === 'solid') {
      return { color: f.color, transparency: f.alpha !== undefined && f.alpha < 1 ? Math.round((1 - f.alpha) * 100) : undefined }
    }
    const key = nextSentinel()
    gradients.set(key, f)
    return { color: key }
  }

  const fontsUsed = new Map<string, { bold: boolean }>()
  const useFont = (family: string, bold: boolean): void => {
    const cur = fontsUsed.get(family) ?? { bold: false }
    fontsUsed.set(family, { bold: cur.bold || bold })
  }

  const patches: SlidePatches[] = []

  for (const scene of scenes) {
    const slide = pptx.addSlide()
    slide.background = { color: scene.bg }
    const sp: SlidePatches = { transition: scene.transition, imageRadius: {}, bulletColor: {} }
    patches.push(sp)
    const seen = new Set<string>()
    const nameOf = (id: string): string => {
      // Morph matches objects whose names start with "!!"
      let n = '!!' + id.replace(/[^A-Za-z0-9_-]/g, '_')
      while (seen.has(n)) n += '_'
      seen.add(n)
      return n
    }

    for (const el of scene.elements) {
      const objectName = nameOf(el.id)
      switch (el.kind) {
        case 'shape':
          addShape(pptx, slide, el, objectName, paint)
          break
        case 'text': {
          const bullet = addText(slide, el, objectName, paint)
          if (bullet) sp.bulletColor[objectName] = bullet
          useFont(el.font, el.bold || el.paras.some((p) => p.runs.some((r) => r.bold)))
          break
        }
        case 'image': {
          addImage(slide, el, objectName)
          if (el.radius && !el.circle) sp.imageRadius[objectName] = Math.min(50000, (el.radius / Math.min(el.w, el.h)) * 100000)
          break
        }
        case 'icon': {
          const svg = iconSvg(el.icon, el.color, el.stroke, 96)
          const data = opts.rasterizeIcon ? await opts.rasterizeIcon(svg, 256) : svgDataUrl(svg)
          slide.addImage({ data, x: el.x, y: el.y, w: el.w, h: el.h, objectName })
          break
        }
        case 'chart':
          addChart(pptx, slide, el, objectName, scene.bg)
          useFont(el.font, false)
          break
      }
    }
    if (scene.notes) slide.addNotes(scene.notes)
  }

  const raw = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer
  const zip = await JSZip.loadAsync(raw)

  // --- per-slide XML patches
  for (let i = 0; i < patches.length; i++) {
    const path = `ppt/slides/slide${i + 1}.xml`
    const file = zip.file(path)
    if (!file) continue
    const xml = await file.async('string')
    zip.file(path, patchSlideXml(xml, patches[i], gradients))
  }

  // --- font embedding
  if (opts.loadFont) {
    const embed = new PPTXEmbedFonts()
    await embed.loadZip(zip)
    for (const [family, use] of fontsUsed) {
      if (!FONTS[family]) continue
      await embed.addFontFromWOFF(family, await opts.loadFont(family, false))
      if (use.bold && hasBoldFace(family)) await embed.addFontFromWOFF(family + BOLD_SUFFIX, await opts.loadFont(family, true))
    }
    await embed.updateFiles()
    const pres = zip.file('ppt/presentation.xml')!
    zip.file('ppt/presentation.xml', mergeBoldFonts(await pres.async('string')))
  }

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

// ---------------------------------------------------------------------------

export const SENTINEL_PREFIX = '1F'

/** Every literal colour in the scenes, so gradient sentinels never collide. */
function collectColors(scenes: Scene[]): Set<string> {
  const out = new Set<string>()
  const visit = (v: unknown): void => {
    if (typeof v === 'string') {
      if (/^[0-9A-Fa-f]{6}$/.test(v)) out.add(v.toUpperCase())
    } else if (Array.isArray(v)) v.forEach(visit)
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'src') visit(x)
  }
  visit(scenes)
  return out
}

type Paint = (f: Fill | undefined) => { color: string; transparency?: number } | undefined

function addShape(pptx: PptxGenJS, slide: PptxGenJS.Slide, el: ShapeEl, objectName: string, paint: Paint): void {
  const line = el.line
    ? {
        color: el.line.color,
        width: el.line.width,
        transparency: el.line.alpha !== undefined && el.line.alpha < 1 ? Math.round((1 - el.line.alpha) * 100) : undefined,
        dashType: el.line.dash ? ('dash' as const) : undefined
      }
    : undefined
  if (el.shape === 'line') {
    slide.addShape(pptx.ShapeType.line, { x: el.x, y: el.y, w: el.w, h: el.h, line, objectName })
    return
  }
  const type =
    el.shape === 'ellipse'
      ? pptx.ShapeType.ellipse
      : el.shape === 'roundRect'
        ? pptx.ShapeType.roundRect
        : el.shape === 'diamond'
          ? pptx.ShapeType.diamond
          : pptx.ShapeType.rect
  const props: Props = {
    x: el.x,
    y: el.y,
    w: el.w,
    h: el.h,
    fill: paint(el.fill),
    line,
    rotate: el.rotate,
    objectName
  }
  if (el.shape === 'roundRect') props.rectRadius = Math.min(el.radius ?? 0, Math.min(el.w, el.h) / 2)
  if (el.shadow)
    props.shadow = { type: 'outer', color: el.shadow.color, opacity: el.shadow.alpha, blur: el.shadow.blur, offset: el.shadow.offset, angle: el.shadow.angle }
  slide.addShape(type, props as PptxGenJS.ShapeProps)
}

/** Returns bullet colour if the text has bullets (applied in post-processing). */
function addText(slide: PptxGenJS.Slide, el: TextEl, objectName: string, paint: Paint): string | undefined {
  const runs: PptxGenJS.TextProps[] = []
  let bulletColor: string | undefined
  el.paras.forEach((p, pi) => {
    const paraOpts: Props = {
      align: el.align,
      paraSpaceBefore: p.spaceBefore ?? 0
    }
    if (p.bullet) {
      paraOpts.bullet = { characterCode: p.bullet.char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'), indent: p.bullet.indent * 72 }
      bulletColor = p.bullet.color
    }
    const list = p.runs.length ? p.runs : [{ text: '' }]
    list.forEach((r, ri) => {
      const c = r.fill ? paint(r.fill) : paint({ kind: 'solid', color: r.color ?? el.color })
      runs.push({
        text: el.upper ? r.text.toUpperCase() : r.text,
        options: {
          ...paraOpts,
          bold: r.bold ?? el.bold,
          italic: r.italic ?? el.italic,
          color: c?.color,
          transparency: c?.transparency,
          breakLine: ri === list.length - 1 && pi < el.paras.length - 1
        } as PptxGenJS.TextPropsOptions
      })
    })
  })
  slide.addText(runs, {
    x: el.x,
    y: el.y,
    w: el.w,
    h: el.h,
    fontFace: el.font,
    fontSize: el.size,
    color: el.color,
    bold: el.bold,
    align: el.align,
    valign: el.valign,
    lineSpacingMultiple: el.lineHeight,
    charSpacing: el.tracking || undefined,
    margin: [0, 0, 0, 0],
    wrap: true,
    rotate: el.rotate,
    objectName
  } as PptxGenJS.TextPropsOptions)
  return bulletColor
}

function addImage(slide: PptxGenJS.Slide, el: ImageEl, objectName: string): void {
  // cover-crop honouring the focus point
  const scale = Math.max(el.w / el.srcW, el.h / el.srcH)
  const iw = el.srcW * scale
  const ih = el.srcH * scale
  slide.addImage({
    data: el.src,
    x: el.x,
    y: el.y,
    w: iw,
    h: ih,
    sizing: { type: 'crop', x: (iw - el.w) * el.focusX, y: (ih - el.h) * el.focusY, w: el.w, h: el.h },
    rounding: !!el.circle,
    rotate: el.rotate,
    objectName
  })
}

function addChart(pptx: PptxGenJS, slide: PptxGenJS.Slide, el: ChartEl, objectName: string, bg: string): void {
  // PowerPoint lists horizontal-bar categories bottom-up; reverse so the first one is on top (like the preview)
  const flip = el.chartKind === 'bar' || el.chartKind === 'stacked-bar'
  const order = <T,>(xs: readonly T[]): T[] => (flip ? [...xs].reverse() : [...xs])
  const data = el.series.map((s) => ({ name: s.name, labels: order(el.categories), values: order(s.values) }))
  const isPie = el.chartKind === 'pie' || el.chartKind === 'donut'
  const multi = el.series.length > 1
  const stacked = el.chartKind === 'stacked-column' || el.chartKind === 'stacked-bar'
  const horizontal = el.chartKind === 'bar' || el.chartKind === 'stacked-bar'
  const fmt = el.unit ? `0"${el.unit.replace(/"/g, '')}"` : 'General'
  const type =
    el.chartKind === 'line'
      ? pptx.ChartType.line
      : el.chartKind === 'area'
        ? pptx.ChartType.area
        : el.chartKind === 'pie'
          ? pptx.ChartType.pie
          : el.chartKind === 'donut'
            ? pptx.ChartType.doughnut
            : el.chartKind === 'radar'
              ? pptx.ChartType.radar
              : pptx.ChartType.bar
  const common: Props = {
    x: el.x,
    y: el.y,
    w: el.w,
    h: el.h,
    objectName,
    chartColors: multi || isPie ? el.colors : [el.colors[0]],
    showLegend: multi || isPie,
    // many slices: a legend on the right stays readable
    legendPos: isPie && el.categories.length > 5 ? 'r' : 'b',
    legendColor: el.textColor,
    legendFontFace: el.font,
    legendFontSize: el.fontSize,
    dataLabelColor: el.textColor,
    dataLabelFontFace: el.font,
    dataLabelFontSize: el.fontSize,
    dataLabelFormatCode: fmt,
    plotArea: { fill: { color: bg, transparency: 100 } }
  }
  if (isPie) {
    Object.assign(common, {
      holeSize: 62,
      showPercent: !el.unit,
      showValue: !!el.unit,
      showLabel: false,
      dataBorder: { pt: 2, color: bg },
      dataLabelColor: el.labelColor ?? 'FFFFFF',
      firstSliceAng: 0
    })
  } else {
    Object.assign(common, {
      barDir: horizontal ? 'bar' : 'col',
      barGrouping: stacked ? 'stacked' : 'clustered',
      barGapWidthPct: stacked ? 45 : 55,
      radarStyle: 'marker',
      catAxisLabelColor: el.textColor,
      catAxisLabelFontFace: el.font,
      catAxisLabelFontSize: el.fontSize,
      valAxisLabelColor: el.textColor,
      valAxisLabelFontFace: el.font,
      valAxisLabelFontSize: el.fontSize,
      valAxisLabelFormatCode: fmt,
      valGridLine: { color: el.gridColor, size: 0.75, style: 'solid' },
      catGridLine: { style: 'none' },
      catAxisLineShow: false,
      valAxisLineShow: false,
      showValue: !multi && (el.chartKind === 'column' || el.chartKind === 'bar'),
      overlap: stacked ? 100 : undefined,
      dataLabelPosition: 'outEnd',
      lineSize: 3,
      lineDataSymbol: 'circle',
      lineDataSymbolSize: 9,
      lineDataSymbolLineColor: bg,
      lineDataSymbolLineSize: 2,
      chartColorsOpacity: el.chartKind === 'area' ? 55 : undefined
    })
  }
  slide.addChart(type, data, common as PptxGenJS.IChartOpts)
}
