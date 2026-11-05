/** La couleur (#rrggbb) d'un point d'une image (u et v de 0 à 1), lue dans l'image elle-même ; rien si elle ne peut pas être lue. */
export function pixelColor(src: string, u: number, v: number): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0)
        const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(u * canvas.width)))
        const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(v * canvas.height)))
        const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data
        if (a === 0) return resolve(null)
        resolve('#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join(''))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}
