/**
 * Miniatures de vidéos faites par la fenêtre de l'appli (sans ffmpeg) : calculs purs.
 * Le nom d'une miniature est le même que celui calculé côté Windows (empreinte FNV-1a 64 bits du chemin dans la bibliothèque,
 * rangée dans un sous-dossier de 2 caractères), pour que les deux se retrouvent.
 */

/** « 3f/3fa9…c2.jpg » : nom de la miniature d'un fichier de la bibliothèque. */
export function thumbName(rel: string): string {
  let h = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(rel)) {
    h ^= BigInt(byte)
    h = BigInt.asUintN(64, h * 0x100000001b3n)
  }
  const hex = h.toString(16).padStart(16, '0')
  return `${hex.slice(0, 2)}/${hex}.jpg`
}

/** Largeur maximale d'une miniature (comme celles des images). */
export const THUMB_WIDTH = 400
/** Hauteur maximale d'une miniature. */
export const THUMB_MAX_HEIGHT = 2000

/** Dimensions de la miniature d'une vidéo de `w` × `h` : 400 px de large au plus, 2000 de haut au plus, proportions gardées. */
export function fitThumb(w: number, h: number): { w: number; h: number } {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 }
  const scale = Math.min(1, THUMB_WIDTH / w, THUMB_MAX_HEIGHT / h)
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

/** L'instant de la vidéo où on prend l'image : une demi-seconde (ou le milieu d'une vidéo plus courte) ; le début si la durée est inconnue. */
export function frameTime(duration: number): number {
  return Number.isFinite(duration) && duration > 0 ? Math.min(0.5, duration / 2) : 0
}

/** Le contenu base64 d'une adresse « data:image/jpeg;base64,… ». */
export function base64Of(dataUrl: string): string {
  const i = dataUrl.indexOf('base64,')
  return i < 0 ? '' : dataUrl.slice(i + 'base64,'.length)
}

/** Découpe une liste en lots de `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += Math.max(1, size)) out.push(items.slice(i, i + Math.max(1, size)))
  return out
}
