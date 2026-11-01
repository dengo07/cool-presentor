/** Reads an image file, downscaling big photos so decks stay light. */
export async function fileToImage(file: File, maxEdge = 2400): Promise<{ src: string; width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Could not read that image'))
      i.src = url
    })
    const w = img.naturalWidth
    const h = img.naturalHeight
    const k = Math.min(1, maxEdge / Math.max(w, h))
    const keepPng = file.type === 'image/png' && file.size < 1.5e6 && k === 1
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * k)
    canvas.height = Math.round(h * k)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const src = keepPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.88)
    return { src, width: canvas.width, height: canvas.height }
  } finally {
    URL.revokeObjectURL(url)
  }
}
