// Partie « texte » de l'ajout d'images à la main (rien ne touche au disque ni à l'écran), testée automatiquement.

export interface AddOutcome {
  name: string
  status: 'added' | 'duplicate' | 'error'
  rel: string | null
  error: string | null
}

export const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif', 'bmp', 'mp4', 'm4v', 'mov', 'webm'] as const

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** Le message affiché après un ajout (vide s'il n'y avait rien). */
export function summarize(outcomes: readonly AddOutcome[]): string {
  const added = outcomes.filter((o) => o.status === 'added').length
  const dup = outcomes.filter((o) => o.status === 'duplicate').length
  const bad = outcomes.filter((o) => o.status === 'error')
  const parts: string[] = []
  if (added > 0) parts.push(plural(added, 'image ajoutée', 'images ajoutées'))
  if (dup > 0) parts.push(`${plural(dup, 'était déjà là', 'étaient déjà là')}`)
  if (bad.length > 0) parts.push(`${plural(bad.length, 'non ajoutée', 'non ajoutées')} (${bad[0].error ?? 'erreur'})`)
  return parts.join(' · ')
}

