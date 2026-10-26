// Recherche et filtres de la grille. Logique « pure » (rien ne touche à l'écran), testée automatiquement.
// Règles : plusieurs valeurs dans un même filtre = « l'une ou l'autre » ;
// des filtres différents se cumulent.

import type { GridBlock } from './blocks.ts'
import { hasColor, hexToLab, type ColorIndex } from './colors.ts'
import type { BlockKind, Source } from './scan.ts'
import { normalize } from './text.ts'

export interface Filters {
  query: string
  sources: Source[]
  kinds: BlockKind[]
  /** Identifiants de types d'image (art graphic, typo…). */
  types: string[]
  /** Collection ouverte (ses blocs seulement), ou rien. */
  collection: { id: string; name: string; parentId?: string | null } | null
  /** Dans une collection qui a des sous-tableaux : ne montrer que les images qui ne sont dans aucun d'eux (comme Pinterest). */
  collectionRest: boolean
  /** Couleur cherchée (« rrggbb »), ou vide. */
  color: string
  /** AAAA-MM-JJ, ou vide. */
  dateFrom: string
  dateTo: string
  /** Ordre aléatoire : 0 = désactivé ; sinon la graine du mélange (une nouvelle graine à chaque activation donne un autre ordre). */
  shuffle: number
}

export const EMPTY_FILTERS: Filters = { query: '', sources: [], kinds: [], types: [], collection: null, collectionRest: false, color: '', dateFrom: '', dateTo: '', shuffle: 0 }

export interface TypeLookup {
  /** type → blocs qui l'ont. */
  index: ReadonlyMap<string, ReadonlySet<string>>
}

/** Générateur de nombres pseudo-aléatoires à graine (mulberry32) : même graine, même suite. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Mélange (Fisher-Yates) avec une graine : même graine, même ordre ; la liste d'origine n'est pas modifiée. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items]
  const random = seededRandom(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Applique la recherche et les filtres. semantic : les images qui ressemblent à la requête (identifiant → ressemblance),
 * calculées à part par le modèle de texte : elles s'ajoutent aux images dont le nom d'auteur ou de tableau correspond, et la
 * liste est alors triée par pertinence (les noms qui correspondent d'abord, puis les images les plus ressemblantes).
 */
export function filterBlocks(
  blocks: GridBlock[],
  f: Filters,
  typeLookup: TypeLookup,
  semantic: ReadonlyMap<string, number> | null = null,
  colors: ColorIndex | null = null,
  collectionBlocks: ReadonlySet<string> | null = null,
  subBlocks: ReadonlySet<string> | null = null,
): GridBlock[] {
  const words = normalize(f.query).split(/\s+/).filter(Boolean)
  const hasDate = f.dateFrom !== '' || f.dateTo !== ''
  const typeSets = f.types.map((t) => typeLookup.index.get(t)).filter((s): s is ReadonlySet<string> => Boolean(s))
  const target = f.color ? hexToLab(f.color) : null
  const rank = new Map<string, number>()
  const ranking = words.length > 0 && semantic !== null
  const kept = blocks.filter((b) => {
    if (f.sources.length > 0 && !f.sources.includes(b.source)) return false
    if (f.kinds.length > 0 && !f.kinds.includes(b.kind)) return false
    if (f.types.length > 0 && !typeSets.some((s) => s.has(b.id))) return false
    if (f.collection && !collectionBlocks?.has(b.id)) return false
    if (f.collection && f.collectionRest && subBlocks?.has(b.id)) return false
    if (target && !hasColor(colors?.get(b.id) ?? [], target)) return false
    if (hasDate) {
      if (!b.publishedAt) return false
      if (f.dateFrom && b.publishedAt < f.dateFrom) return false
      if (f.dateTo && b.publishedAt > f.dateTo) return false
    }
    if (words.length > 0) {
      const byName = words.every((w) => b.search.includes(w))
      const bySight = semantic?.get(b.id)
      if (!byName && bySight === undefined) return false
      if (ranking) rank.set(b.id, (byName ? 1 : 0) + (bySight ?? 0))
    }
    return true
  })
  if (ranking) kept.sort((a, b) => (rank.get(b.id) ?? 0) - (rank.get(a.id) ?? 0))
  return f.shuffle !== 0 ? shuffled(kept, f.shuffle) : kept
}

/**
 * La page « Tout » est montrée dans un ordre différent à chaque ouverture : sans recherche, sans tableau ouvert et sans « Aléatoire » choisi à la main,
 * on applique le tirage au sort de l'ouverture. Une recherche garde son ordre de pertinence, un tableau son ordre.
 */
export function withOpeningShuffle(f: Filters, seed: number): Filters {
  return f.shuffle === 0 && !f.query.trim() && !f.collection ? { ...f, shuffle: seed } : f
}

/** Nombre de critères actifs (la recherche compte pour un). */
export function activeCount(f: Filters): number {
  return (
    (f.query.trim() ? 1 : 0) + (f.sources.length > 0 ? 1 : 0) + (f.kinds.length > 0 ? 1 : 0) + (f.types.length > 0 ? 1 : 0) + (f.color ? 1 : 0) + (f.collection ? 1 : 0) +
    (f.dateFrom || f.dateTo ? 1 : 0) + (f.shuffle !== 0 ? 1 : 0)
  )
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export type DatePreset = '30d' | '90d' | 'year'
export const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: '30d', label: '30 derniers jours' },
  { id: '90d', label: '3 derniers mois' },
  { id: 'year', label: 'Cette année' },
]

export function datePreset(id: DatePreset, today: Date): { from: string; to: string } {
  const to = iso(today)
  if (id === 'year') return { from: `${today.getFullYear()}-01-01`, to }
  const from = new Date(today)
  from.setDate(from.getDate() - (id === '30d' ? 30 : 90))
  return { from: iso(from), to }
}
