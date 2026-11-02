/**
 * Photos de recettes rangées dans la bibliothèque (dossier « recettes ») au lieu d'être cachées dans la base.
 * Dans une page, une photo rangée dans le dossier est écrite « form-lib:recettes/3fa9…c2.jpg » : un chemin À L'INTÉRIEUR de la
 * bibliothèque, qui ne change pas quand on déplace le dossier. L'adresse affichable se calcule à l'ouverture de la page.
 */

export const LIBRARY_URL_PREFIX = 'form-lib:'

export const isLibraryUrl = (url: string | null | undefined): url is string => !!url && url.startsWith(LIBRARY_URL_PREFIX)

/** « form-lib:recettes/a.jpg » -> « recettes/a.jpg » (rien si ce n'est pas une adresse de la bibliothèque, ou si elle sortirait du dossier). */
export function libraryRel(url: string): string | null {
  if (!isLibraryUrl(url)) return null
  const rel = url.slice(LIBRARY_URL_PREFIX.length)
  if (rel === '' || rel.startsWith('/') || rel.startsWith('\\') || /^[a-z]:/i.test(rel)) return null
  return rel.split(/[\\/]/).some((p) => p === '..' || p === '') ? null : rel
}

export const toLibraryUrl = (rel: string) => `${LIBRARY_URL_PREFIX}${rel}`

export interface DataImage {
  mime: string
  ext: string
  base64: string
}

const EXT_OF: Record<string, string> = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/bmp': 'bmp' }

/** Une image enregistrée dans la page (« data:image/jpeg;base64,… »), ou rien (autre adresse, ou format non pris en charge, comme le SVG). */
export function parseDataImage(url: unknown): DataImage | null {
  if (typeof url !== 'string') return null
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(url)
  if (!m) return null
  const mime = m[1].toLowerCase()
  const ext = EXT_OF[mime]
  return ext ? { mime, ext, base64: m[2].replace(/\s+/g, '') } : null
}

interface BlockLike {
  type?: string
  props?: { url?: unknown }
  children?: unknown
}

function walk(blocks: unknown, visit: (b: BlockLike) => void) {
  if (!Array.isArray(blocks)) return
  for (const b of blocks as BlockLike[]) {
    if (b && typeof b === 'object') {
      visit(b)
      walk(b.children, visit)
    }
  }
}

const base64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0)

/** Combien de photos sont encore dans la page, et ce qu'elles pèsent (octets). */
export function countDataImages(blocks: unknown): { count: number; bytes: number } {
  let count = 0
  let bytes = 0
  walk(blocks, (b) => {
    if (b.type !== 'image') return
    const img = parseDataImage(b.props?.url)
    if (img) {
      count++
      bytes += base64Bytes(img.base64)
    }
  })
  return { count, bytes }
}

/** Range une image et renvoie son chemin dans la bibliothèque (« recettes/… »). */
export type StoreImage = (image: DataImage) => Promise<string>

/**
 * Remplace chaque photo intégrée par son adresse « form-lib:… » après l'avoir rangée. Les blocs reçus ne sont pas modifiés ;
 * si le rangement d'une photo échoue, elle reste telle quelle (rien n'est perdu) et l'erreur est comptée.
 */
export async function moveImagesToLibrary(blocks: unknown[], store: StoreImage): Promise<{ blocks: unknown[]; moved: number; failed: number; bytes: number }> {
  const copy = structuredClone(blocks)
  const targets: { block: BlockLike; image: DataImage }[] = []
  walk(copy, (b) => {
    if (b.type !== 'image') return
    const image = parseDataImage(b.props?.url)
    if (image) targets.push({ block: b, image })
  })
  let moved = 0
  let failed = 0
  let bytes = 0
  for (const { block, image } of targets) {
    try {
      const rel = await store(image)
      block.props = { ...block.props, url: toLibraryUrl(rel) }
      moved++
      bytes += base64Bytes(image.base64)
    } catch {
      failed++
    }
  }
  return { blocks: copy, moved, failed, bytes }
}
