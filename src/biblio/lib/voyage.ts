// Le voyage sur la carte : à partir d'une image, quatre façons de choisir la suivante. Logique « pure », testée automatiquement.

export type StepKind = 'same' | 'different' | 'colors' | 'surprise'

export const STEP_LABELS: Record<StepKind, string> = {
  same: 'Plus pareil',
  different: 'Un peu différent',
  colors: 'Mêmes couleurs',
  surprise: 'Surprends-moi',
}

export interface Candidate {
  index: number
  score: number
}

export interface StepOptions {
  rand?: () => number
  /** Écart de palette avec l'image de départ (Infinity si inconnu). */
  colorDistance?: (index: number) => number
  /** Pour « Surprends-moi » : des images prises ailleurs sur la carte. */
  far?: readonly number[]
}

const pickOne = <T>(list: readonly T[], rand: () => number): T | undefined => list[Math.floor(rand() * list.length)]

/**
 * Choisit l'image suivante. `ranked` : les voisines de l'image de départ, de la plus proche à la plus lointaine.
 * `visited` : les images déjà vues pendant ce voyage (on n'y retourne pas). Rend null s'il n'y a rien à proposer.
 */
export function pickStep(kind: StepKind, ranked: readonly Candidate[], visited: ReadonlySet<number>, options: StepOptions = {}): number | null {
  const rand = options.rand ?? Math.random
  const fresh = ranked.filter((c) => !visited.has(c.index))
  switch (kind) {
    case 'same':
      return fresh[0]?.index ?? null
    case 'different': {
      // ni les plus proches (trop pareilles), ni les plus lointaines : le milieu de la liste
      const middle = ranked.slice(8, 40).filter((c) => !visited.has(c.index))
      return (pickOne(middle, rand) ?? pickOne(fresh, rand))?.index ?? null
    }
    case 'colors': {
      const dist = options.colorDistance
      if (!dist) return null
      let best: number | null = null
      let bestD = Infinity
      for (const c of fresh.slice(0, 80)) {
        const d = dist(c.index)
        if (d < bestD) {
          bestD = d
          best = c.index
        }
      }
      return best
    }
    case 'surprise':
      return pickOne((options.far ?? []).filter((i) => !visited.has(i)), rand) ?? null
  }
}
