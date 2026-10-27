// Range les images ajoutées à la main dans la bonne collection, une fois que l'IA a calculé leur empreinte. Voir autoPlace.ts pour la règle.

import { MODEL_ID } from './ai.ts'
import { pickCollection, type Candidate } from './autoPlace.ts'
import { blockVector } from './classify.ts'
import { addBlocksToCollection } from './collections.ts'
import { getDb } from './db.ts'
import { getSetting, setSetting } from './library.ts'
import { MANUAL_COLLECTION } from './scan.ts'
import { MY_ACCOUNT } from './types.ts'
import { decodeVector } from './vectors.ts'

const DONE_KEY = 'manual_placed'

export interface Placed {
  blockId: string
  collectionId: string
  collectionName: string
}

/** Les collections où l'IA a le droit de ranger : les miennes et mes tableaux Pinterest (pas « Mes ajouts », pas les comptes des autres). */
const CANDIDATE_COLLECTIONS = `SELECT id FROM lib_collections WHERE (kind = 'manual' AND id <> '${MANUAL_COLLECTION}') OR id LIKE 'pin:${MY_ACCOUNT}/%'`

async function vectorsOf(where: string): Promise<Map<string, Float32Array>> {
  const d = await getDb()
  const rows = await d.select<{ block: string; vec: string }[]>(
    `SELECT f.block_id AS block, e.vec FROM lib_embeddings e JOIN lib_files f ON f.path_rel = e.path_rel WHERE e.model = $1 AND f.missing = 0 AND f.block_id IN (${where})`,
    [MODEL_ID],
  )
  const per = new Map<string, Float32Array[]>()
  for (const r of rows) per.set(r.block, [...(per.get(r.block) ?? []), decodeVector(r.vec)])
  return new Map([...per].map(([id, list]) => [id, list.length === 1 ? list[0] : blockVector(list)]))
}

/**
 * Pour chaque image ajoutée à la main qui a son empreinte et qu'on n'a pas encore regardée : cherche la collection de ses voisines
 * et l'y range. Une image n'est regardée qu'une fois (si Victor l'enlève ensuite de la collection, on ne la remet pas).
 */
export async function placeAddedImages(): Promise<Placed[]> {
  const d = await getDb()
  let done: string[] = []
  try { done = JSON.parse((await getSetting(DONE_KEY)) ?? '[]') as string[] } catch { /* liste illisible : on repart de zéro */ }
  const seen = new Set(done)

  const fresh = await vectorsOf("SELECT id FROM lib_blocks WHERE source = 'manual' AND trashed_at IS NULL")
  const todo = [...fresh.keys()].filter((id) => !seen.has(id))
  if (todo.length === 0) return []

  // Les images déjà rangées par Victor, avec leurs collections.
  const known = await vectorsOf(`SELECT block_id FROM lib_block_collections WHERE collection_id IN (${CANDIDATE_COLLECTIONS})`)
  const members = await d.select<{ block_id: string; collection_id: string }[]>(
    `SELECT block_id, collection_id FROM lib_block_collections WHERE collection_id IN (${CANDIDATE_COLLECTIONS})`,
  )
  const of = new Map<string, string[]>()
  for (const m of members) of.set(m.block_id, [...(of.get(m.block_id) ?? []), m.collection_id])
  const candidates: Candidate[] = [...known].flatMap(([id, vec]) => (of.has(id) && !fresh.has(id) ? [{ vec, collections: of.get(id)! }] : []))
  const names = new Map((await d.select<{ id: string; name: string }[]>('SELECT id, name FROM lib_collections')).map((c) => [c.id, c.name]))

  const placed: Placed[] = []
  for (const id of todo) {
    const pick = pickCollection(fresh.get(id)!, candidates)
    if (!pick) continue
    await addBlocksToCollection(pick.collectionId, [id])
    placed.push({ blockId: id, collectionId: pick.collectionId, collectionName: names.get(pick.collectionId) ?? 'une collection' })
  }
  await setSetting(DONE_KEY, JSON.stringify([...seen, ...todo]))
  return placed
}

/** Le message qui dit où l'IA a rangé les images ajoutées. */
export function placedMessage(placed: readonly Placed[]): string {
  if (placed.length === 1) return `L'IA a rangé l'image dans « ${placed[0].collectionName} ».`
  const names = [...new Set(placed.map((p) => p.collectionName))]
  return `L'IA a rangé ${placed.length} images : ${names.slice(0, 3).map((n) => `« ${n} »`).join(', ')}${names.length > 3 ? '…' : ''}.`
}
