import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { addDocument, getDocuments, removeDocument } from '../src/main/documents'
import { buildDeck } from '../src/core/layout/engine'
import { heuristicMeasurer } from '../src/core/measure'
import { exportPptx } from '../src/core/export/pptx'
import { sampleDeck } from '../src/core/sample'

const dir = mkdtempSync(join(tmpdir(), 'cp-docs-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** A minimal but valid one-page PDF containing `text`. */
function pdf(text: string): Buffer {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

/** A minimal .docx with two paragraphs. */
async function docx(paras: string[]): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  )
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`
  )
  return zip.generateAsync({ type: 'nodebuffer' })
}

const write = (name: string, data: string | Buffer): string => {
  const p = join(dir, name)
  writeFileSync(p, data)
  return p
}

describe('document attachments', () => {
  it('extracts text from a PDF and keeps the bytes for the API engine', async () => {
    const info = await addDocument(write('report.pdf', pdf('Bees pollinate one third of our crops')))
    expect(info).toMatchObject({ name: 'report.pdf', kind: 'pdf', pages: 1 })
    const [doc] = getDocuments([info.id])
    expect(doc.text).toContain('Bees pollinate one third of our crops')
    expect(doc.pdf?.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('extracts Word paragraphs', async () => {
    const info = await addDocument(write('notes.docx', await docx(['Brazil has 26 states', 'Brasília is the capital'])))
    const [doc] = getDocuments([info.id])
    expect(info.kind).toBe('docx')
    expect(doc.text).toContain('Brazil has 26 states')
    expect(doc.text).toContain('Brasília is the capital')
  })

  it('reads slides and speaker notes from a PowerPoint (e.g. an old deck to redesign)', async () => {
    const deck = sampleDeck()
    const bytes = await exportPptx(deck, buildDeck(deck, heuristicMeasurer), { rasterizeIcon: async () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' })
    const info = await addDocument(write('old.pptx', Buffer.from(bytes)))
    const [doc] = getDocuments([info.id])
    expect(info).toMatchObject({ kind: 'pptx', pages: deck.slides.length })
    expect(doc.text).toMatch(/^Slide 1:/)
    expect(doc.text).toContain('Decks that make people say wow')
    expect(doc.text).toContain('Notes: Welcome everyone')
  })

  it('reads text, Markdown and HTML (without tags or scripts)', async () => {
    const md = await addDocument(write('a.md', '# Title\n\n- point one'))
    expect(getDocuments([md.id])[0].text).toContain('- point one')
    const html = await addDocument(write('b.html', '<html><script>alert(1)</script><p>Hello &amp; welcome</p></html>'))
    expect(getDocuments([html.id])[0].text).toBe('Hello & welcome')
  })

  it('flags empty documents and rejects unsupported types', async () => {
    const empty = await addDocument(write('empty.txt', ''))
    expect(empty.warning).toMatch(/empty/)
    await expect(addDocument(write('x.exe', 'MZ'))).rejects.toThrow(/Unsupported/)
  })

  it('forgets removed documents', async () => {
    const info = await addDocument(write('gone.txt', 'temporary'))
    removeDocument(info.id)
    expect(getDocuments([info.id])).toEqual([])
  })
})
