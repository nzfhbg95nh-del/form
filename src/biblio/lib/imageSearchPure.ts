// Recherche par image : les petites fonctions pures (testées) ; le reste (canvas, IA) est dans imageSearch.ts.

/** Octets → texte base64, par paquets (un seul appel avec une grosse image dépasserait la taille permise des arguments). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

/** La taille d'une image réduite pour que son plus grand côté ne dépasse pas `max` (jamais agrandie). */
export function fitSide(width: number, height: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(width, height, 1))
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) }
}

/** Vrai pour un fichier que le navigateur peut lire comme image (la recherche ne prend pas les vidéos). */
export const isSearchableImage = (file: { type: string }) => file.type.startsWith('image/')
