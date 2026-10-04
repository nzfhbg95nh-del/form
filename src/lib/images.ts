export interface ProcessedImage {
  width: number
  height: number
  /** Image réduite à 2400 px au plus (ou l'originale si elle est déjà petite). */
  dataUrl: string
  /** Miniature de 512 px au plus. */
  thumbUrl: string
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

function drawScaled(bitmap: ImageBitmap, maxSide: number, quality: number): { url: string; w: number; h: number } {
  const f = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * f))
  const h = Math.max(1, Math.round(bitmap.height * f))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("Impossible de préparer l'image.")
  ctx.drawImage(bitmap, 0, 0, w, h)
  // WebP garde la transparence ; si le navigateur ne sait pas l'écrire il renvoie du PNG, ce qui convient aussi.
  return { url: canvas.toDataURL('image/webp', quality), w, h }
}

/** Prépare une image pour la toile : version allégée + miniature. Les GIF animés sont gardés tels quels. */
export async function processImage(file: Blob, maxSide = 2400, thumbSide = 512): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(file)
  try {
    const thumb = drawScaled(bitmap, thumbSide, 0.8)
    const small = bitmap.width <= maxSide && bitmap.height <= maxSide && file.size < 1_500_000
    const keepOriginal = file.type === 'image/gif' || small
    const dataUrl = keepOriginal ? await readAsDataUrl(file) : drawScaled(bitmap, maxSide, 0.9).url
    return { width: bitmap.width, height: bitmap.height, dataUrl, thumbUrl: thumb.url }
  } finally {
    bitmap.close()
  }
}

/** Pixels (RGBA) d'une version 64×64 de l'image, pour en extraire la palette. */
export function samplePixels(url: string, size = 64): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return reject(new Error('canvas indisponible'))
      ctx.drawImage(img, 0, 0, size, size)
      resolve(ctx.getImageData(0, 0, size, size).data)
    }
    img.onerror = () => reject(new Error("Image illisible"))
    img.src = url
  })
}
