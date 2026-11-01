import * as lucide from 'lucide'

type IconNode = [string, Record<string, string | number>][]

const registry = lucide as unknown as Record<string, IconNode | undefined>

export function iconExists(name: string): boolean {
  return Array.isArray(registry[name])
}

/** All lucide icon names (PascalCase). */
export function iconNames(): string[] {
  return Object.keys(registry).filter((k) => /^[A-Z]/.test(k) && Array.isArray(registry[k]))
}

/** Builds a standalone SVG string for a lucide icon. */
export function iconSvg(name: string, color: string, stroke = 2, size = 24): string {
  const node = registry[name] ?? registry['Sparkles']!
  const children = node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`
}

export function svgDataUrl(svg: string): string {
  const b64 =
    typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(svg)))
      : (globalThis as unknown as { Buffer: { from(s: string): { toString(e: string): string } } }).Buffer.from(svg).toString('base64')
  return `data:image/svg+xml;base64,${b64}`
}
