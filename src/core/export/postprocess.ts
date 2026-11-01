import type { Fill } from '../scene'

// ---------------------------------------------------------------------------
// XML post-processing for things PptxGenJS can't express:
//  - Morph / fade slide transitions
//  - gradient fills (shapes + text) via sentinel colours
//  - rounded-corner picture geometry
//  - coloured bullets
// ---------------------------------------------------------------------------

export interface SlidePatches {
  transition: 'morph' | 'fade' | 'none'
  imageRadius: Record<string, number> // object name → adj (0..50000)
  bulletColor: Record<string, string> // object name → hex
}

export function gradientXml(f: Fill): string {
  if (f.kind === 'solid') throw new Error('not a gradient')
  const gs = f.stops
    .map((s) => {
      const a = s.alpha !== undefined && s.alpha < 1 ? `<a:alpha val="${Math.round(Math.max(0, s.alpha) * 100000)}"/>` : ''
      return `<a:gs pos="${Math.round(s.pos * 1000)}"><a:srgbClr val="${s.color}">${a}</a:srgbClr></a:gs>`
    })
    .join('')
  const shade =
    f.kind === 'linear'
      ? `<a:lin ang="${Math.round((((f.angle % 360) + 360) % 360) * 60000)}" scaled="0"/>`
      : '<a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>'
  return `<a:gradFill flip="none" rotWithShape="1"><a:gsLst>${gs}</a:gsLst>${shade}</a:gradFill>`
}

export function transitionXml(kind: 'morph' | 'fade' | 'none'): string {
  if (kind === 'none') return ''
  if (kind === 'fade') return '<p:transition spd="med"><p:fade/></p:transition>'
  return (
    '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">' +
    '<mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" Requires="p159">' +
    '<p:transition xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" spd="slow" p14:dur="1400"><p159:morph option="byObject"/></p:transition>' +
    '</mc:Choice>' +
    '<mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback>' +
    '</mc:AlternateContent>'
  )
}

/** Applies fn to every <p:sp> / <p:pic> element whose cNvPr name matches a key. */
function patchNamed(xml: string, tag: 'p:sp' | 'p:pic', names: Record<string, unknown>, fn: (el: string, name: string) => string): string {
  if (!Object.keys(names).length) return xml
  const re = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g')
  return xml.replace(re, (el) => {
    const m = /<p:cNvPr [^>]*name="([^"]*)"/.exec(el)
    if (m && m[1] in names) return fn(el, m[1])
    return el
  })
}

/**
 * PptxGenJS emits an <a:pPr> before *every* run of a multi-run paragraph,
 * which is schema-invalid (PowerPoint may offer to "repair"). Keep the first.
 */
export function dedupeParagraphProps(xml: string): string {
  return xml.replace(/<a:p>([\s\S]*?)<\/a:p>/g, (_all, inner: string) => {
    let seen = false
    const fixed = inner.replace(/<a:pPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:pPr>)/g, (pPr) => {
      if (seen) return ''
      seen = true
      return pPr
    })
    return `<a:p>${fixed}</a:p>`
  })
}

export function patchSlideXml(xml: string, p: SlidePatches, gradients: Map<string, Fill>): string {
  xml = dedupeParagraphProps(xml)
  // 1) gradients: every solidFill using a sentinel colour becomes a gradFill
  if (gradients.size) {
    xml = xml.replace(/<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"(?:\/>|>[\s\S]*?<\/a:srgbClr>)<\/a:solidFill>/g, (all, c: string) => {
      const g = gradients.get(c.toUpperCase())
      return g ? gradientXml(g) : all
    })
  }
  // 2) rounded pictures
  xml = patchNamed(xml, 'p:pic', p.imageRadius, (el, name) =>
    el.replace(
      /<a:prstGeom prst="rect"><a:avLst\/><\/a:prstGeom>/,
      `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.round(p.imageRadius[name])}"/></a:avLst></a:prstGeom>`
    )
  )
  // 3) bullet colours
  xml = patchNamed(xml, 'p:sp', p.bulletColor, (el, name) =>
    el.replace(/<a:buSzPct val="100000"\/>/g, `<a:buClr><a:srgbClr val="${p.bulletColor[name]}"/></a:buClr><a:buSzPct val="100000"/>`)
  )
  // 4) transition (must follow clrMapOvr, precede timing)
  const tr = transitionXml(p.transition)
  if (tr) {
    if (xml.includes('<p:timing')) xml = xml.replace('<p:timing', tr + '<p:timing')
    else xml = xml.replace('</p:sld>', tr + '</p:sld>')
  }
  return xml
}

/**
 * pptx-embed-fonts only knows "regular" faces. We embed bold faces under a
 * temporary name and fold them into the family's <p:bold> slot here.
 */
export const BOLD_SUFFIX = '__bold'

export function mergeBoldFonts(presXml: string): string {
  const boldRe = new RegExp(
    `<p:embeddedFont><p:font typeface="([^"]+)${BOLD_SUFFIX}"\\s*/><p:regular r:id="([^"]+)"\\s*/></p:embeddedFont>`,
    'g'
  )
  const bolds: [string, string][] = []
  presXml = presXml.replace(boldRe, (_all, fam: string, rid: string) => {
    bolds.push([fam, rid])
    return ''
  })
  for (const [fam, rid] of bolds) {
    const famRe = new RegExp(`(<p:embeddedFont><p:font typeface="${fam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*/><p:regular r:id="[^"]+"\\s*/>)`)
    presXml = presXml.replace(famRe, `$1<p:bold r:id="${rid}"/>`)
  }
  return presXml
}
