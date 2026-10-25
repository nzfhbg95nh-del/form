// Corbeille de Klippr et suppression définitive.
//   1. « Mettre à la corbeille » : l'image disparaît de partout dans Klippr (ses rangements sont gardés). Aucun fichier touché.
//   2. « Restaurer » : elle revient, dans les mêmes tableaux.
//   3. « Supprimer définitivement » : le fichier part dans la Corbeille Windows (récupérable), Klippr oublie l'image
//      et ne la réimporte plus, même si Social Saver remet un jour le même fichier.

import { invoke } from '@tauri-apps/api/core'
import type { Source } from './scan.ts'
import { getDb, inChunks } from './db.ts'

export interface TrashedBlock {
  id: string
  source: Source
  owner: string
  board: string | null
  /** Miniature (chemin relatif au dossier des miniatures). */
  thumb: string | null
  /** Nombre de fichiers du bloc. */
  count: number
  trashedAt: string
}

export async function trashBlocks(ids: readonly string[]) {
  if (ids.length === 0) return
  const d = await getDb()
  const now = new Date().toISOString()
  await inChunks([...ids], (marks, chunk) => d.execute(`UPDATE lib_blocks SET trashed_at = $${chunk.length + 1} WHERE id IN (${marks})`, [...chunk, now]))
}

export async function restoreBlocks(ids: readonly string[]) {
  if (ids.length === 0) return
  const d = await getDb()
  await inChunks([...ids], (marks, chunk) => d.execute(`UPDATE lib_blocks SET trashed_at = NULL WHERE id IN (${marks})`, chunk))
}

/** Les images à la corbeille, de la plus récemment supprimée à la plus ancienne. */
export async function loadTrash(): Promise<TrashedBlock[]> {
  const d = await getDb()
  const rows = await d.select<{ id: string; source: Source; owner: string; board: string | null; trashed_at: string; thumb: string | null; thumb_ok: number; n: number }[]>(
    `SELECT b.id, b.source, b.owner, b.board, b.trashed_at, f.thumb, f.thumb_ok,
            (SELECT COUNT(*) FROM lib_files x WHERE x.block_id = b.id) AS n
     FROM lib_blocks b
     JOIN lib_files f ON f.block_id = b.id AND f.position = (SELECT MIN(position) FROM lib_files WHERE block_id = b.id)
     WHERE b.trashed_at IS NOT NULL
     ORDER BY b.trashed_at DESC, b.id`,
  )
  return rows.map((r) => ({ id: r.id, source: r.source, owner: r.owner, board: r.board, thumb: r.thumb_ok === 1 ? r.thumb : null, count: r.n, trashedAt: r.trashed_at }))
}

export async function trashCount(): Promise<number> {
  const d = await getDb()
  const [row] = await d.select<{ n: number }[]>('SELECT COUNT(*) AS n FROM lib_blocks WHERE trashed_at IS NOT NULL')
  return row.n
}

interface Outcome {
  rel: string
  ok: boolean
  error: string | null
}

/**
 * Supprime définitivement des images : leurs fichiers partent dans la Corbeille Windows, puis Klippr les oublie (et ne les réimportera plus).
 * Une image dont un fichier n'a pas pu partir reste dans la corbeille de Klippr.
 */
export async function deleteForever(ids: readonly string[], root: string): Promise<{ deleted: number; failed: number }> {
  const d = await getDb()
  let deleted = 0
  let failed = 0
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200)
    const files: { rel: string; block: string }[] = []
    await inChunks([...batch], async (marks, chunk) => {
      files.push(...(await d.select<{ rel: string; block: string }[]>(`SELECT path_rel AS rel, block_id AS block FROM lib_files WHERE block_id IN (${marks})`, chunk)))
    })
    const outcomes = files.length > 0 ? await invoke<Outcome[]>('trash_files', { root, rels: files.map((f) => f.rel) }) : []
    const bad = new Set(outcomes.filter((o) => !o.ok).map((o) => o.rel))
    const badBlocks = new Set(files.filter((f) => bad.has(f.rel)).map((f) => f.block))
    const done = batch.filter((id) => !badBlocks.has(id))
    failed += batch.length - done.length
    deleted += done.length
    if (done.length === 0) continue
    const now = new Date().toISOString()
    // On oublie l'image : d'abord ce qui dépend de ses fichiers, puis ses fichiers, puis le bloc ; et on note qu'elle ne doit pas revenir.
    await inChunks([...done], async (marks, chunk) => {
      await d.execute(`DELETE FROM lib_embeddings WHERE path_rel IN (SELECT path_rel FROM lib_files WHERE block_id IN (${marks}))`, chunk)
      await d.execute(`DELETE FROM lib_colors WHERE path_rel IN (SELECT path_rel FROM lib_files WHERE block_id IN (${marks}))`, chunk)
      await d.execute(`DELETE FROM lib_files WHERE block_id IN (${marks})`, chunk)
      await d.execute(`DELETE FROM lib_block_types WHERE block_id IN (${marks})`, chunk)
      await d.execute(`DELETE FROM lib_block_collections WHERE block_id IN (${marks})`, chunk)
      await d.execute(`DELETE FROM lib_links WHERE block_a IN (${marks}) OR block_b IN (${marks})`, chunk)
      await d.execute(`DELETE FROM lib_blocks WHERE id IN (${marks})`, chunk)
    })
    for (const id of done) await d.execute('INSERT OR IGNORE INTO lib_forgotten (block_id, deleted_at) VALUES ($1, $2)', [id, now])
  }
  return { deleted, failed }
}

/** Les identifiants des images supprimées définitivement. */
export async function loadForgotten(): Promise<Set<string>> {
  const d = await getDb()
  const rows = await d.select<{ block_id: string }[]>('SELECT block_id FROM lib_forgotten')
  return new Set(rows.map((r) => r.block_id))
}
