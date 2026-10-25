// Collections : mes tableaux Pinterest, les comptes Instagram d'origine (automatiques) et, plus tard, les miennes.
// Un bloc peut être dans plusieurs collections. Ici : lecture dans la base et rangement en sections pour la page Collections.

import { getDb, multiInsert } from './db.ts'
import { normalize } from './text.ts'
import { MY_ACCOUNT } from './types.ts'

export type CollectionKind = 'instagram' | 'pinterest' | 'manual' | 'unsorted'

export interface CollectionCard {
  id: string
  name: string
  kind: CollectionKind
  owner: string | null
  description: string
  /** Collection dans laquelle celle-ci est rangée (sous-tableau), ou rien. */
  parentId: string | null
  /** Place choisie à la main (glisser-déposer) parmi les collections de même parent ; rien = ordre par nom. */
  position: number | null
  /** Le bloc choisi comme image de couverture, ou rien (les images les plus récentes servent d'aperçu). */
  coverBlock: string | null
  /** Nombre de blocs. */
  count: number
  /** Miniatures (chemins relatifs au dossier des miniatures) : jusqu'à 4 aperçus. */
  previews: string[]
}

export interface CollectionSections {
  /** « À trier » : tout ce qui n'est encore dans aucune de mes collections (une seule carte). */
  unsorted: CollectionCard[]
  /** Mes collections (créées à la main). */
  mine: CollectionCard[]
  /** Mes tableaux Pinterest. */
  boards: CollectionCard[]
  /** Tableaux Pinterest d'autres comptes. */
  otherBoards: CollectionCard[]
  /** Comptes Instagram, du plus enregistré au moins enregistré. */
  instagram: CollectionCard[]
}

/** Ma place d'abord (celles que j'ai rangées), puis le nom. */
export const byPositionThenName = (a: CollectionCard, b: CollectionCard) =>
  (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name, 'fr')

/** Nouvel ordre quand on dépose `moved` à la place de `target` (avant elle, ou après si on la tire vers l'avant de la liste). */
export function reorderIds(ids: readonly string[], moved: string, target: string): string[] {
  if (moved === target || !ids.includes(moved) || !ids.includes(target)) return [...ids]
  const without = ids.filter((id) => id !== moved)
  const from = ids.indexOf(moved)
  const to = ids.indexOf(target)
  // Vers la droite : on passe après la cible ; vers la gauche : avant elle.
  without.splice(from < to ? without.indexOf(target) + 1 : without.indexOf(target), 0, moved)
  return without
}

const byCountThenName = (a: CollectionCard, b: CollectionCard) => b.count - a.count || a.name.localeCompare(b.name, 'fr')

/** Range les collections en sections, en ne gardant que celles dont le nom (ou le compte) contient la recherche. */
export function groupCollections(cards: readonly CollectionCard[], query = ''): CollectionSections {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  const kept = words.length === 0 ? cards : cards.filter((c) => words.every((w) => normalize(`${c.name} ${c.owner ?? ''}`).includes(w)))
  return {
    unsorted: kept.filter((c) => c.kind === 'unsorted'),
    mine: kept.filter((c) => c.kind === 'manual' && !c.parentId).sort(byPositionThenName),
    boards: kept.filter((c) => c.kind === 'pinterest' && c.owner === MY_ACCOUNT).sort(byCountThenName),
    otherBoards: kept.filter((c) => c.kind === 'pinterest' && c.owner !== MY_ACCOUNT).sort(byCountThenName),
    instagram: kept.filter((c) => c.kind === 'instagram').sort(byCountThenName),
  }
}

const PREVIEWS = 4

/** Collection « virtuelle » qui réunit tout Instagram (au lieu d'une collection par compte). */
export const INSTAGRAM_ALL = 'all:instagram'

/** Collection « virtuelle » : les blocs (hors Instagram, qui a sa propre collection) qui ne sont dans aucune de mes collections ; les nouveaux enregistrements y arrivent d'eux-mêmes. */
export const UNSORTED = 'all:unsorted'

const UNSORTED_WHERE = `b.source <> 'instagram' AND b.trashed_at IS NULL AND NOT EXISTS (
  SELECT 1 FROM lib_block_collections bc JOIN lib_collections c ON c.id = bc.collection_id WHERE bc.block_id = b.id AND c.kind = 'manual'
)`

/** La couverture choisie passe en premier (c'est la grande image de la carte) ; les autres aperçus suivent, sans doublon. */
export const withCover = (cover: string | null, previews: readonly string[]): string[] =>
  (cover ? [cover, ...previews.filter((p) => p !== cover)] : [...previews]).slice(0, 4)

/** Ce qu'il faut savoir d'une collection pour l'ouvrir dans la grille. */
export const openTarget = (c: Pick<CollectionCard, 'id' | 'name' | 'parentId'>) => ({ id: c.id, name: c.name, parentId: c.parentId })

/** Toutes les collections avec leur nombre de blocs et quelques miniatures. */
export async function loadCollections(): Promise<CollectionCard[]> {
  const d = await getDb()
  const rows = await d.select<{ id: string; name: string; kind: CollectionKind; owner: string | null; description: string; parent_id: string | null; position: number | null; cover_block: string | null; cover_thumb: string | null; n: number }[]>(
    `SELECT c.id, c.name, c.kind, c.owner, c.description, c.parent_id, c.position, c.cover_block,
            (SELECT f.thumb FROM lib_files f WHERE f.block_id = c.cover_block AND f.thumb_ok = 1 AND f.thumb IS NOT NULL ORDER BY f.position LIMIT 1) AS cover_thumb,
            (SELECT COUNT(*) FROM lib_block_collections bc JOIN lib_blocks bb ON bb.id = bc.block_id WHERE bc.collection_id = c.id AND bb.trashed_at IS NULL) AS n
     FROM lib_collections c
     WHERE c.kind <> 'instagram'`,
  )
  const previews = await d.select<{ collection_id: string; thumb: string }[]>(
    `SELECT collection_id, thumb FROM (
       SELECT bc.collection_id, f.thumb,
              ROW_NUMBER() OVER (PARTITION BY bc.collection_id ORDER BY b.imported_at DESC, b.id) AS rn
       FROM lib_block_collections bc
       JOIN lib_blocks b ON b.id = bc.block_id
       JOIN lib_files f ON f.block_id = b.id AND f.position = (SELECT MIN(position) FROM lib_files WHERE block_id = b.id)
       WHERE f.thumb_ok = 1 AND f.thumb IS NOT NULL AND b.trashed_at IS NULL
     ) WHERE rn <= $1`,
    [PREVIEWS],
  )
  const thumbs = new Map<string, string[]>()
  for (const p of previews) thumbs.set(p.collection_id, [...(thumbs.get(p.collection_id) ?? []), p.thumb])
  const [ig] = await d.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM lib_blocks WHERE source = 'instagram' AND trashed_at IS NULL")
  const igThumbs = await d.select<{ thumb: string }[]>(
    `SELECT f.thumb FROM lib_blocks b
     JOIN lib_files f ON f.block_id = b.id AND f.position = (SELECT MIN(position) FROM lib_files WHERE block_id = b.id)
     WHERE b.source = 'instagram' AND b.trashed_at IS NULL AND f.thumb_ok = 1 AND f.thumb IS NOT NULL
     ORDER BY b.published_at DESC, b.id LIMIT $1`,
    [PREVIEWS],
  )
  const instagram: CollectionCard[] = ig.n > 0
    ? [{ id: INSTAGRAM_ALL, name: 'Instagram', kind: 'instagram', owner: null, description: '', parentId: null, position: null, coverBlock: null, count: ig.n, previews: igThumbs.map((t) => t.thumb) }]
    : []
  const [un] = await d.select<{ n: number }[]>(`SELECT COUNT(*) AS n FROM lib_blocks b WHERE ${UNSORTED_WHERE}`)
  const unThumbs = await d.select<{ thumb: string }[]>(
    `SELECT f.thumb FROM lib_blocks b
     JOIN lib_files f ON f.block_id = b.id AND f.position = (SELECT MIN(position) FROM lib_files WHERE block_id = b.id)
     WHERE ${UNSORTED_WHERE} AND f.thumb_ok = 1 AND f.thumb IS NOT NULL
     ORDER BY b.imported_at DESC, b.published_at DESC, b.id LIMIT $1`,
    [PREVIEWS],
  )
  const unsorted: CollectionCard[] = [{ id: UNSORTED, name: 'À trier', kind: 'unsorted', owner: null, description: '', parentId: null, position: null, coverBlock: null, count: un.n, previews: unThumbs.map((t) => t.thumb) }]
  return [...unsorted, ...instagram, ...rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    owner: r.owner,
    description: r.description,
    parentId: r.parent_id,
    position: r.position,
    coverBlock: r.cover_block,
    count: r.n,
    previews: withCover(r.cover_thumb, thumbs.get(r.id) ?? []),
  }))]
}

/** Les blocs d'une collection. */
export async function loadCollectionBlocks(collectionId: string): Promise<Set<string>> {
  const d = await getDb()
  if (collectionId === UNSORTED) {
    const all = await d.select<{ id: string }[]>(`SELECT b.id FROM lib_blocks b WHERE ${UNSORTED_WHERE}`)
    return new Set(all.map((r) => r.id))
  }
  if (collectionId === INSTAGRAM_ALL) {
    const all = await d.select<{ id: string }[]>("SELECT id FROM lib_blocks WHERE source = 'instagram' AND trashed_at IS NULL")
    return new Set(all.map((r) => r.id))
  }
  const rows = await d.select<{ block_id: string }[]>('SELECT bc.block_id FROM lib_block_collections bc JOIN lib_blocks b ON b.id = bc.block_id WHERE bc.collection_id = $1 AND b.trashed_at IS NULL', [collectionId])
  return new Set(rows.map((r) => r.block_id))
}

// ───────────────────────── Mes collections ─────────────────────────

/** Les sous-collections directes d'une collection, par nom. */
export const childrenOf = (cards: readonly CollectionCard[], parentId: string) =>
  cards.filter((c) => c.parentId === parentId).sort(byPositionThenName)

/** Une collection et toutes ses sous-collections (à tous les niveaux). */
export function withDescendants(cards: readonly CollectionCard[], id: string): string[] {
  const out = [id]
  for (let i = 0; i < out.length; i++) for (const c of cards) if (c.parentId === out[i] && !out.includes(c.id)) out.push(c.id)
  return out
}

/** Les collections où l'on peut ranger des blocs : les miennes seulement (les tableaux et comptes d'origine ne changent pas). */
export const manualCollections = (cards: readonly CollectionCard[]) => cards.filter((c) => c.kind === 'manual')

/** « Art graphic › Graphic tee » */
export function collectionPath(cards: readonly CollectionCard[], id: string): string {
  const names: string[] = []
  let cur = cards.find((c) => c.id === id)
  for (let guard = 0; cur && guard < 10; guard++) {
    names.unshift(cur.name)
    const parent: string | null = cur.parentId
    cur = parent ? cards.find((c) => c.id === parent) : undefined
  }
  return names.join(' › ')
}

export async function createCollection(name: string, parentId: string | null = null): Promise<string> {
  const clean = name.trim()
  if (!clean) throw new Error('Le nom est vide.')
  const id = `man:${crypto.randomUUID()}`
  const d = await getDb()
  await d.execute(
    "INSERT INTO lib_collections (id, name, kind, owner, description, created_at, parent_id) VALUES ($1, $2, 'manual', NULL, '', $3, $4)",
    [id, clean, new Date().toISOString(), parentId],
  )
  return id
}

export async function renameCollection(id: string, name: string) {
  const clean = name.trim()
  if (!clean) return
  const d = await getDb()
  await d.execute("UPDATE lib_collections SET name = $2 WHERE id = $1 AND kind = 'manual'", [id, clean])
}

/** Supprime des collections à moi (avec leurs sous-collections si on les passe). Les blocs eux-mêmes ne sont jamais touchés. */
export async function deleteCollections(ids: readonly string[]) {
  const d = await getDb()
  for (const id of ids) {
    await d.execute("DELETE FROM lib_block_collections WHERE collection_id = $1 AND collection_id IN (SELECT id FROM lib_collections WHERE kind = 'manual')", [id])
    await d.execute("DELETE FROM lib_collections WHERE id = $1 AND kind = 'manual'", [id])
  }
}

export async function addBlocksToCollection(collectionId: string, blockIds: readonly string[]) {
  await multiInsert('lib_block_collections', ['block_id', 'collection_id'], blockIds.map((b) => [b, collectionId]), { verb: 'INSERT OR IGNORE' })
}

export async function removeBlockFromCollection(collectionId: string, blockId: string) {
  const d = await getDb()
  await d.execute("DELETE FROM lib_block_collections WHERE collection_id = $1 AND block_id = $2 AND collection_id IN (SELECT id FROM lib_collections WHERE kind = 'manual')", [collectionId, blockId])
}

/** Les collections d'un bloc : les miennes, le tableau Pinterest ou le compte d'origine. */
export async function loadBlockCollectionIds(blockId: string): Promise<string[]> {
  const d = await getDb()
  const rows = await d.select<{ collection_id: string }[]>('SELECT collection_id FROM lib_block_collections WHERE block_id = $1', [blockId])
  return rows.map((r) => r.collection_id)
}

/** Enregistre l'ordre choisi à la main : la première reçoit 0, la suivante 1… */
export async function saveOrder(ids: readonly string[]) {
  const d = await getDb()
  for (const [i, id] of ids.entries()) {
    await d.execute("UPDATE lib_collections SET position = $2 WHERE id = $1 AND kind = 'manual'", [id, i])
  }
}

/** Les blocs rangés dans les sous-collections directes d'une collection. */
export async function loadSubBlocks(collectionId: string): Promise<Set<string>> {
  const d = await getDb()
  const rows = await d.select<{ block_id: string }[]>(
    `SELECT DISTINCT bc.block_id FROM lib_block_collections bc
     JOIN lib_collections c ON c.id = bc.collection_id JOIN lib_blocks b ON b.id = bc.block_id WHERE c.parent_id = $1 AND b.trashed_at IS NULL`,
    [collectionId],
  )
  return new Set(rows.map((r) => r.block_id))
}

export interface CollectionSettings {
  name: string
  description: string
  /** Un bloc, ou null pour revenir aux aperçus automatiques. */
  coverBlock: string | null
}

/** Enregistre les réglages d'une de mes collections. */
export async function saveSettings(id: string, s: CollectionSettings) {
  const name = s.name.trim()
  if (!name) throw new Error('Le nom est vide.')
  const d = await getDb()
  await d.execute(
    "UPDATE lib_collections SET name = $2, description = $3, cover_block = $4 WHERE id = $1 AND kind = 'manual'",
    [id, name, s.description.trim(), s.coverBlock],
  )
}

/** Choisit l'image de couverture d'une de mes collections. */
export async function setCover(id: string, blockId: string | null) {
  const d = await getDb()
  await d.execute("UPDATE lib_collections SET cover_block = $2 WHERE id = $1 AND kind = 'manual'", [id, blockId])
}

// ───────────────────────── Choisir une collection (façon « Enregistrer » de Pinterest) ─────────────────────────

/**
 * Les « meilleurs choix » pour ranger une image : la collection ouverte, puis celles où l'on a rangé en dernier (les plus récentes d'abord).
 * Seulement des collections à moi, sans doublon, sans `exclude`, au plus `max`.
 */
export function bestChoices(cards: readonly CollectionCard[], recentIds: readonly string[], openId: string | null, exclude: string | null = null, max = 3): CollectionCard[] {
  const mine = new Map(manualCollections(cards).map((c) => [c.id, c]))
  const out: CollectionCard[] = []
  for (const id of [openId, ...recentIds]) {
    const card = id ? mine.get(id) : undefined
    if (card && card.id !== exclude && !out.includes(card)) out.push(card)
    if (out.length === max) break
  }
  return out
}

/** Les collections à moi (tableaux et sous-tableaux) dont le chemin contient tous les mots de la recherche. */
export function searchCollections(cards: readonly CollectionCard[], query: string, exclude: string | null = null): CollectionCard[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  return manualCollections(cards)
    .filter((c) => c.id !== exclude && words.every((w) => normalize(collectionPath(cards, c.id)).includes(w)))
    .sort((a, b) => collectionPath(cards, a.id).localeCompare(collectionPath(cards, b.id), 'fr'))
}

const RECENT_KEY = 'klippr.recentCollections'

/** Les dernières collections où l'on a rangé (la plus récente en premier). */
export function recentCollections(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export const withRecent = (recent: readonly string[], id: string, keep = 6): string[] => [id, ...recent.filter((x) => x !== id)].slice(0, keep)

export function rememberCollection(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(withRecent(recentCollections(), id)))
  } catch {
    /* sans conséquence : on ne se souvient pas de ce choix */
  }
}
