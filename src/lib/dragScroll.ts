// Défilement automatique pendant un glisser, comme dans Notion : plus on approche le bord haut ou bas, plus la page défile vite.
// Logique « pure », testée automatiquement.

/** Hauteur (en pixels) de la bande, en haut et en bas, où la page se met à défiler. */
export const EDGE_ZONE = 90
/** Vitesse maximale, en pixels par image (60 images par seconde). */
export const MAX_SPEED = 26

/**
 * Vitesse de défilement pour un pointeur à la hauteur `y`, dans une zone visible allant de `top` à `bottom`.
 * Négative : on monte ; positive : on descend ; 0 : pas de défilement. La vitesse croît comme le carré de l'enfoncement dans la bande,
 * pour qu'on puisse avancer doucement près du bord et vite tout contre lui (ou au-delà).
 */
export function edgeScrollSpeed(y: number, top: number, bottom: number, zone = EDGE_ZONE, max = MAX_SPEED): number {
  const height = bottom - top
  if (height <= 0) return 0
  // Petite fenêtre : la bande ne dépasse pas le tiers de la hauteur, pour garder un milieu calme.
  const band = Math.min(zone, height / 3)
  if (band <= 0) return 0
  const depthTop = top + band - y
  const depthBottom = y - (bottom - band)
  const ratio = (d: number) => Math.min(1, d / band)
  if (depthTop > 0) return -Math.max(1, Math.round(max * ratio(depthTop) ** 2))
  if (depthBottom > 0) return Math.max(1, Math.round(max * ratio(depthBottom) ** 2))
  return 0
}
