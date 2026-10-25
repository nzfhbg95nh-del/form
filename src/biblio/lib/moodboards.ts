// Mes moodboards : la liste, et le plan de chaque toile (JSON) enregistré dans la base.

import type { GridBlock } from './blocks.ts'
import { getDb, inChunks } from './db.ts'
import { addImages, expandCarousels, parseBoard, serializeBoard, type ImageRef } from './moodboard.ts'

export interface MoodboardCard {
  id: string
  name: string
  /** Le tableau d'où il est parti, s'il y en a un. */
  collectionId: string | null
  updatedAt: string
  /** Nombre d'éléments sur la toile. */
  count: number
  /** Miniatures des premières images (chemins relatifs au dossier des miniatures), pour la carte. */
  previews: string[]
}

export const itemCount = (content: string | null): number => parseBoard(content).items.length

/** Les miniatures des 4 premières images de la toile. */
export const previewsOf = (content: string | null): string[] =>
  parseBoard(content).items.filter((i) => i.kind === 'image' && i.thumb).slice(0, 4).map((i) => i.thumb as string)

/** Ce qu'il faut savoir d'un bloc pour le poser sur une toile : son premier fichier. */
export const refOf = (b: GridBlock): ImageRef => ({ blockId: b.id, rel: b.rel, thumb: b.thumb, ratio: b.ratio, video: b.firstKind === 'video' })

/** Du plus récemment modifié au plus ancien. */
export const byRecent = (a: MoodboardCard, b: MoodboardCard) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name, 'fr')

export async function listMoodboards(): Promise<MoodboardCard[]> {
  const d = await getDb()
  const rows = await d.select<{ id: string; name: string; content: string; collection_id: string | null; updated_at: string }[]>(
    'SELECT id, name, content, collection_id, updated_at FROM lib_moodboards',
  )
  return rows
    .map((r) => ({ id: r.id, name: r.name, collectionId: r.collection_id, updatedAt: r.updated_at, count: itemCount(r.content), previews: previewsOf(r.content) }))
    .sort(byRecent)
}

export async function createMoodboard(name: string, collectionId: string | null = null): Promise<string> {
  const clean = name.trim()
  if (!clean) throw new Error('Le nom est vide.')
  const id = `mood:${crypto.randomUUID()}`
  const now = new Date().toISOString()
  const d = await getDb()
  await d.execute('INSERT INTO lib_moodboards (id, name, content, collection_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)', [id, clean, '', collectionId, now])
  return id
}

export async function renameMoodboard(id: string, name: string) {
  const clean = name.trim()
  if (!clean) return
  const d = await getDb()
  await d.execute('UPDATE lib_moodboards SET name = $2, updated_at = $3 WHERE id = $1', [id, clean, new Date().toISOString()])
}

export async function deleteMoodboard(id: string) {
  const d = await getDb()
  await d.execute('DELETE FROM lib_moodboards WHERE id = $1', [id])
}

export async function loadMoodboard(id: string): Promise<{ id: string; name: string; content: string } | null> {
  const d = await getDb()
  const rows = await d.select<{ id: string; name: string; content: string }[]>('SELECT id, name, content FROM lib_moodboards WHERE id = $1', [id])
  return rows[0] ?? null
}

export async function saveMoodboardContent(id: string, content: string) {
  const d = await getDb()
  await d.execute('UPDATE lib_moodboards SET content = $2, updated_at = $3 WHERE id = $1', [id, content, new Date().toISOString()])
}

/** Pose des images de la bibliothèque sur un moodboard (rien n'est copié). Rend le nombre ajouté et le nombre déjà présent. */
export async function addToMoodboard(id: string, refs: ImageRef[]): Promise<{ added: number; skipped: number }> {
  const m = await loadMoodboard(id)
  if (!m) throw new Error('Ce moodboard n\'existe plus.')
  const { board, added, skipped } = addImages(parseBoard(m.content), expandCarousels(refs, await slidesOf(refs)))
  if (added > 0) await saveMoodboardContent(id, serializeBoard(board))
  return { added, skipped }
}

/** Les images de chaque bloc qui en a plusieurs (carrousels), pour les poser toutes sur un moodboard. */
async function slidesOf(refs: ImageRef[]): Promise<Map<string, ImageRef[]>> {
  const d = await getDb()
  const out = new Map<string, ImageRef[]>()
  await inChunks([...new Set(refs.map((r) => r.blockId))], async (marks, chunk) => {
    const rows = await d.select<{ block: string; rel: string; kind: string; width: number | null; height: number | null; thumb: string | null; thumb_ok: number }[]>(
      `SELECT block_id AS block, path_rel AS rel, kind, width, height, thumb, thumb_ok FROM lib_files WHERE block_id IN (${marks}) AND missing = 0 AND kind IN ('image', 'video') ORDER BY block_id, position`,
      chunk,
    )
    for (const r of rows) {
      const list = out.get(r.block) ?? []
      list.push({ blockId: r.block, rel: r.rel, thumb: r.thumb_ok === 1 ? r.thumb : null, ratio: r.width && r.height ? r.width / r.height : 1, video: r.kind === 'video' })
      out.set(r.block, list)
    }
  })
  return out
}
