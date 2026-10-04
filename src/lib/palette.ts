export interface RGB {
  r: number
  g: number
  b: number
}

export function rgbToHex({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** Noir ou blanc, selon ce qui se lit le mieux sur cette couleur de fond. */
export function readableOn(hex: string): '#111111' | '#ffffff' {
  const c = hexToRgb(hex)
  if (!c) return '#111111'
  return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255 > 0.6 ? '#111111' : '#ffffff'
}

interface Bucket {
  pixels: RGB[]
}

function range(pixels: RGB[]) {
  const min = { r: 255, g: 255, b: 255 }
  const max = { r: 0, g: 0, b: 0 }
  for (const p of pixels) {
    min.r = Math.min(min.r, p.r); max.r = Math.max(max.r, p.r)
    min.g = Math.min(min.g, p.g); max.g = Math.max(max.g, p.g)
    min.b = Math.min(min.b, p.b); max.b = Math.max(max.b, p.b)
  }
  return { r: max.r - min.r, g: max.g - min.g, b: max.b - min.b }
}

/** Où couper un paquet trié : là où les deux moitiés sont le plus homogènes (méthode d'Otsu), pas forcément au milieu. */
function bestCut(sorted: RGB[], channel: keyof RGB): number {
  const n = sorted.length
  const values = sorted.map((p) => p[channel])
  const total = values.reduce((s, v) => s + v, 0)
  let leftSum = 0
  let best = Math.floor(n / 2)
  let bestScore = -1
  for (let i = 1; i < n; i++) {
    leftSum += values[i - 1]
    if (values[i] === values[i - 1]) continue // on ne coupe pas entre deux pixels identiques
    const meanLeft = leftSum / i
    const meanRight = (total - leftSum) / (n - i)
    const score = i * (n - i) * (meanLeft - meanRight) ** 2 // écart entre les deux moitiés, pondéré par leur taille
    if (score > bestScore) { bestScore = score; best = i }
  }
  return best
}

function average(pixels: RGB[]): RGB {
  const n = pixels.length || 1
  return {
    r: pixels.reduce((s, p) => s + p.r, 0) / n,
    g: pixels.reduce((s, p) => s + p.g, 0) / n,
    b: pixels.reduce((s, p) => s + p.b, 0) / n,
  }
}

/**
 * Palette d'une image par « coupe médiane » : on découpe l'ensemble des pixels en `count` paquets
 * de couleurs proches, et chaque paquet donne une couleur. Les pixels transparents sont ignorés.
 * `rgba` : tableau de pixels (R, G, B, A, R, G, B, A…) comme celui d'un canvas.
 * Résultat : les couleurs en #rrggbb, de la plus fréquente à la moins fréquente.
 */
export function extractPalette(rgba: ArrayLike<number>, count = 6): string[] {
  const pixels: RGB[] = []
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] >= 128) pixels.push({ r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] })
  }
  if (pixels.length === 0) return []

  let buckets: Bucket[] = [{ pixels }]
  while (buckets.length < count) {
    // On coupe le paquet le plus étendu en deux, selon son canal le plus varié.
    let index = -1
    let widest = 0
    buckets.forEach((b, i) => {
      if (b.pixels.length < 2) return
      const r = range(b.pixels)
      const spread = Math.max(r.r, r.g, r.b)
      if (spread > widest) { widest = spread; index = i }
    })
    if (index < 0 || widest === 0) break
    const bucket = buckets[index]
    const r = range(bucket.pixels)
    const channel: keyof RGB = r.r >= r.g && r.r >= r.b ? 'r' : r.g >= r.b ? 'g' : 'b'
    const sorted = [...bucket.pixels].sort((a, b) => a[channel] - b[channel])
    const cut = bestCut(sorted, channel)
    buckets = [...buckets.slice(0, index), { pixels: sorted.slice(0, cut) }, { pixels: sorted.slice(cut) }, ...buckets.slice(index + 1)]
  }

  const seen = new Set<string>()
  return buckets
    .sort((a, b) => b.pixels.length - a.pixels.length)
    .map((b) => rgbToHex(average(b.pixels)))
    .filter((hex) => (seen.has(hex) ? false : (seen.add(hex), true)))
}

/** Fusionne les palettes de plusieurs images : on garde les couleurs les plus distinctes. */
export function mergePalettes(palettes: string[][], count = 8): string[] {
  const all = palettes.flat()
  const result: string[] = []
  for (const hex of all) {
    const c = hexToRgb(hex)
    if (!c) continue
    const tooClose = result.some((o) => {
      const d = hexToRgb(o)!
      return Math.hypot(c.r - d.r, c.g - d.g, c.b - d.b) < 40
    })
    if (!tooClose) result.push(hex)
    if (result.length >= count) break
  }
  return result
}
