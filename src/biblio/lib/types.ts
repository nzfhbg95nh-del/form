// Types d'image : lecture, règles des tableaux, classement automatique, ajout et retrait à la main.

import { getDb } from './db.ts'
import { tagKey } from './text.ts'

export interface TypeInfo {
  id: string
  name: string
}

/**
 * Origine d'un type sur une image :
 * - board : la règle d'un tableau Pinterest ;
 * - manual : choisi par Victor ;
 * - auto : classé par l'IA (score = confiance) ; ne sert jamais d'exemple à l'IA ;
 * - removed : retiré par Victor (ni la règle du tableau ni l'IA ne le remettent).
 */
export type TypeOrigin = 'board' | 'manual' | 'auto'

export interface BlockType extends TypeInfo {
  origin: TypeOrigin
  score: number | null
}

export interface TypeIndex {
  types: (TypeInfo & { count: number })[]
  /** type → blocs qui l'ont. */
  index: ReadonlyMap<string, ReadonlySet<string>>
}

export const EMPTY_TYPE_INDEX: TypeIndex = { types: [], index: new Map() }

/** Types de départ, avec les tableaux Pinterest de DYSARTADD dont ils reprennent les images. */
export const DEFAULT_TYPES: { name: string; boards: string[] }[] = [
  { name: 'Art graphic', boards: ['Art graphic'] },
  { name: 'Typo', boards: ['Typo', 'Typographie', 'Typography', 'Typographie & lettering'] },
  { name: 'Brand identity', boards: ['Brand identity'] },
  { name: 'Photography & Clip', boards: ['Photography & Clip'] },
  { name: 'Fashion & sewing projects', boards: ['Fashion & sewing projects'] },
  { name: 'Architecture & Interior design', boards: ['Architecture & Interior design'] },
  { name: '3D & CGI', boards: ['3D & CGI'] },
  { name: 'Product design & objects', boards: ['Product design & objects'] },
  { name: 'Drawing & Painting', boards: ['Drawing & Painting'] },
  { name: 'Website', boards: ['Website'] },
  { name: 'Tattoo', boards: ['Tattoo'] },
  // Types sans tableau. Recette : trouvé par l'IA (description). Autres : les astuces (3D, graphisme…) et tout ce qui n'est dans aucun tableau.
  { name: 'Recette', boards: [] },
  { name: 'Autres', boards: [] },
]
const OTHER_ID = 'autres'
export const MY_ACCOUNT = 'DYSARTADD'

export const boardCollectionId = (board: string) => `pin:${MY_ACCOUNT}/${board}`

/** Crée les types de départ qui manquent, relie les tableaux à leur type, puis applique ces règles aux images. */
export async function seedAndApplyTypes() {
  const d = await getDb()
  // Les types de départ existent toujours (ceux qui manquent, comme « Recette » et « Astuces » ajoutés après coup, sont créés).
  const now = new Date().toISOString()
  for (const [i, t] of DEFAULT_TYPES.entries()) {
    await d.execute('INSERT OR IGNORE INTO lib_types (id, name, position, created_at) VALUES ($1, $2, $3, $4)', [tagKey(t.name), t.name, i, now])
  }
  // « Astuces » est devenu « Autres » (le fourre-tout) : l'ancien type disparaît, ce que Victor y avait rangé passe dans « Autres ».
  await d.execute("UPDATE OR IGNORE lib_block_types SET type_id = $1 WHERE type_id = 'astuces' AND origin IN ('manual', 'removed')", [OTHER_ID])
  await d.execute("DELETE FROM lib_block_types WHERE type_id = 'astuces'")
  await d.execute("DELETE FROM lib_types WHERE id = 'astuces'")
  // Un tableau téléchargé plus tard (par exemple « Typo ») est relié à son type dès qu'il apparaît, tant que le type existe.
  for (const t of DEFAULT_TYPES) {
    const id = tagKey(t.name)
    for (const b of t.boards) {
      await d.execute(
        'INSERT OR IGNORE INTO lib_type_boards (type_id, collection_id) SELECT $1, c.id FROM lib_collections c WHERE c.id = $2 AND EXISTS (SELECT 1 FROM lib_types WHERE id = $1)',
        [id, boardCollectionId(b)],
      )
    }
  }
  // Les nouvelles images d'un tableau reçoivent son type ; ce que j'ai retiré à la main ne revient pas (INSERT OR IGNORE).
  await d.execute(
    `INSERT OR IGNORE INTO lib_block_types (block_id, type_id, origin)
     SELECT bc.block_id, tb.type_id, 'board' FROM lib_type_boards tb JOIN lib_block_collections bc ON bc.collection_id = tb.collection_id`,
  )
}

export async function loadTypeIndex(): Promise<TypeIndex> {
  const d = await getDb()
  const types = await d.select<TypeInfo[]>('SELECT id, name FROM lib_types ORDER BY position, name')
  const rows = await d.select<{ block_id: string; type_id: string }[]>("SELECT t.block_id, t.type_id FROM lib_block_types t JOIN lib_blocks b ON b.id = t.block_id WHERE t.origin <> 'removed' AND b.trashed_at IS NULL")
  const index = new Map<string, Set<string>>()
  for (const r of rows) {
    const set = index.get(r.type_id) ?? new Set<string>()
    set.add(r.block_id)
    index.set(r.type_id, set)
  }
  return { types: types.map((t) => ({ ...t, count: index.get(t.id)?.size ?? 0 })), index }
}

export async function loadBlockTypes(blockId: string): Promise<BlockType[]> {
  const d = await getDb()
  return d.select<BlockType[]>(
    `SELECT t.id, t.name, bt.origin, bt.score FROM lib_block_types bt JOIN lib_types t ON t.id = bt.type_id
     WHERE bt.block_id = $1 AND bt.origin <> 'removed' ORDER BY t.position, t.name`,
    [blockId],
  )
}

/** Ajoute un type à la main ; un nom inconnu crée le type. */
export async function addBlockType(blockId: string, name: string): Promise<boolean> {
  const clean = name.trim()
  const id = tagKey(clean)
  if (!id) return false
  const d = await getDb()
  const [{ next }] = await d.select<{ next: number }[]>('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM lib_types')
  await d.execute('INSERT OR IGNORE INTO lib_types (id, name, position, created_at) VALUES ($1, $2, $3, $4)', [id, clean, next, new Date().toISOString()])
  await d.execute("INSERT OR REPLACE INTO lib_block_types (block_id, type_id, origin, score) VALUES ($1, $2, 'manual', NULL)", [blockId, id])
  // Une image rangée à la main n'a plus besoin du simple rangement automatique dans « Autres ».
  if (id !== OTHER_ID) await d.execute("DELETE FROM lib_block_types WHERE block_id = $1 AND type_id = $2 AND origin = 'auto' AND score IS NULL", [blockId, OTHER_ID])
  // Recette et Autres sont exclusifs : choisis à la main, ils remplacent les types de l'IA de cette image.
  if (id === OTHER_ID || id === 'recette') await d.execute("DELETE FROM lib_block_types WHERE block_id = $1 AND type_id <> $2 AND origin = 'auto'", [blockId, id])
  return true
}

/** Retire un type. S'il venait d'un tableau ou de l'IA, on le marque « retiré » pour qu'il ne revienne pas tout seul. */
export async function removeBlockType(blockId: string, typeId: string) {
  const d = await getDb()
  await d.execute("UPDATE lib_block_types SET origin = 'removed', score = NULL WHERE block_id = $1 AND type_id = $2 AND origin IN ('board', 'auto')", [blockId, typeId])
  await d.execute("DELETE FROM lib_block_types WHERE block_id = $1 AND type_id = $2 AND origin = 'manual'", [blockId, typeId])
}

/** Annule le classement automatique de l'IA (ce que Victor a rangé ou retiré n'est pas touché). */
export async function clearAutoTypes(): Promise<number> {
  const d = await getDb()
  const [{ n }] = await d.select<{ n: number }[]>("SELECT COUNT(DISTINCT block_id) AS n FROM lib_block_types WHERE origin = 'auto'")
  await d.execute("DELETE FROM lib_block_types WHERE origin = 'auto'")
  return n
}
