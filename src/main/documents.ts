import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import JSZip from 'jszip'

// ---------------------------------------------------------------------------
// Documents the user attaches as source material for AI deck generation.
// Text is extracted here so both AI engines can use it; PDFs also keep their
// bytes so the API engine can send the original (with charts and tables).
// ---------------------------------------------------------------------------

export type DocKind = 'pdf' | 'docx' | 'pptx' | 'text'

export interface Attachment {
  id: string
  name: string
  kind: DocKind
  text: string
  pages?: number
  pdf?: Buffer
}

/** What the renderer sees. */
export interface AttachmentInfo {
  id: string
  name: string
  kind: DocKind
  pages?: number
  chars: number
  warning?: string
}

export const MAX_FILE_BYTES = 30 * 1024 * 1024
/** ~300k tokens of text in total – well inside the model's context window. */
export const MAX_TOTAL_CHARS = 1_200_000

export const DOC_EXTENSIONS = ['pdf', 'docx', 'pptx', 'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'html', 'htm', 'rtf']

const cache = new Map<string, Attachment>()

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|h\d|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
}

function decodeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

/** Text of every slide (and its speaker notes) in a .pptx. */
async function pptxText(buf: Buffer): Promise<{ text: string; pages: number }> {
  const zip = await JSZip.loadAsync(buf)
  const num = (p: string): number => Number(/(\d+)\.xml$/.exec(p)?.[1] ?? 0)
  const slides = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => num(a) - num(b))
  const paras = (xml: string): string[] =>
    (xml.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? [])
      .map((p) => decodeXml((p.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? []).map((t) => t.slice(5, -6)).join('')).trim())
      .filter(Boolean)
  const out: string[] = []
  for (const s of slides) {
    out.push(`Slide ${num(s)}:`, ...paras(await zip.file(s)!.async('string')).map((t) => `- ${t}`))
    const notes = zip.file(`ppt/notesSlides/notesSlide${num(s)}.xml`)
    if (notes) {
      const n = paras(await notes.async('string')).filter((t) => !/^\d+$/.test(t))
      if (n.length) out.push(`Notes: ${n.join(' ')}`)
    }
    out.push('')
  }
  return { text: out.join('\n'), pages: slides.length }
}

async function extract(path: string, buf: Buffer): Promise<Omit<Attachment, 'id' | 'name'>> {
  const ext = extname(path).slice(1).toLowerCase()
  if (ext === 'pdf') {
    const { getDocumentProxy, extractText } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(buf))
    const { totalPages, text } = await extractText(pdf, { mergePages: true })
    return { kind: 'pdf', text: String(text).replace(/\n{3,}/g, '\n\n'), pages: totalPages, pdf: buf }
  }
  if (ext === 'docx') {
    const mammoth = await import('mammoth')
    const { value } = await (mammoth.default ?? mammoth).extractRawText({ buffer: buf })
    return { kind: 'docx', text: value }
  }
  if (ext === 'pptx') {
    const { text, pages } = await pptxText(buf)
    return { kind: 'pptx', text, pages }
  }
  if (DOC_EXTENSIONS.includes(ext)) {
    const raw = buf.toString('utf8')
    return { kind: 'text', text: ext === 'html' || ext === 'htm' ? stripHtml(raw) : raw }
  }
  throw new Error(`Unsupported file type .${ext}. Use PDF, Word, PowerPoint or a text file.`)
}

/** Reads and caches a document; returns its summary for the UI. */
export async function addDocument(path: string): Promise<AttachmentInfo> {
  const info = await stat(path)
  if (info.size > MAX_FILE_BYTES) throw new Error(`${basename(path)} is larger than 30 MB.`)
  const doc = await extract(path, await readFile(path))
  const a: Attachment = { id: randomUUID(), name: basename(path), ...doc, text: doc.text.trim() }
  cache.set(a.id, a)
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    pages: a.pages,
    chars: a.text.length,
    warning: a.text.length < 20 ? (a.kind === 'pdf' ? 'No text found – this may be a scanned PDF.' : 'This file looks empty.') : undefined
  }
}

export function removeDocument(id: string): void {
  cache.delete(id)
}

export function getDocuments(ids: string[]): Attachment[] {
  return ids.map((id) => cache.get(id)).filter((a): a is Attachment => !!a)
}
