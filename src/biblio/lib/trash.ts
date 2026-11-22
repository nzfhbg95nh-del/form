// Corbeille de Form et suppression définitive.
//   1. « Mettre à la corbeille » : l'image disparaît de partout dans Form (ses rangements sont gardés). Aucun fichier touché.
//      Ça marche aussi pour une seule image d'un carrousel : le reste du carrousel reste.
//   2. « Restaurer » : elle revient, dans les mêmes tableaux.
//   3. « Supprimer définitivement » : le fichier part dans la Corbeille Windows (récupérable), Form oublie l'image
//      et ne la réimporte plus, même si Form remet un jour le même fichier.

import { invoke } from '@tauri-apps/api/core'
import type { FileKind, Source } from './scan.ts'
import { getDb, inChunks, multiInsert } from './db.ts'
import { sortTrash } from './trashPlan.ts'

/** Un élément de la corbeille : une image entière (ou un carrousel entier), ou une seule image prise dans un carrousel. */
export interface TrashedItem {
  /** « block » : l'id du bloc ; « file » : le chemin du fichier. */
  key: string
  type: 'block' | 'file'
  blockId: string
  source: Source
  owner: string
  board: string | null
  /** Fichier montré (chemin relatif au dossier de la bibliothèque). */
  rel: string
  kind: FileKind
  /** Miniature (chemin relatif au dossier des miniatures). */
  thumb: string | null
  /** Nombre d'images (1 pour une image seule de carrousel). */
  count: number
  trashedAt: string
}

/** Les colonnes d'un fichier, identiques dans lib_files et lib_trashed_files (liste fixe du code). */
const FILE_COLS = 'path_rel, block_id, position, kind, size, mtime, width, height, duration, thumb, thumb_ok, missing'

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

/**
 * Met à la corbeille des images prises dans des carrousels : elles disparaissent de partout, le reste du carrousel reste.
 * Leurs empreintes d'IA et leurs couleurs sont effacées (elles seront recalculées si on les restaure).
 */
export async function trashFiles(rels: readonly string[]) {
  if (rels.length === 0) return
  const d = await getDb()
  const now = new Date().toISOString()
  await inChunks([...rels], async (marks, chunk) => {
    await d.execute(`INSERT OR REPLACE INTO lib_trashed_files (${FILE_COLS}, trashed_at) SELECT ${FILE_COLS}, $${chunk.length + 1} FROM lib_files WHERE path_rel IN (${marks})`, [...chunk, now])
    await d.execute(`DELETE FROM lib_embeddings WHERE path_rel IN (${marks})`, chunk)
    await d.execute(`DELETE FROM lib_colors WHERE path_rel IN (${marks})`, chunk)
    await d.execute(`DELETE FROM lib_files WHERE path_rel IN (${marks})`, chunk)
  })
}

/** Remet des images de carrousel à leur place (et leur carrousel, s'il était lui-même à la corbeille). */
export async function restoreFiles(rels: readonly string[]) {
  if (rels.length === 0) return
  const d = await getDb()
  await inChunks([...rels], async (marks, chunk) => {
    await d.execute(`UPDATE lib_blocks SET trashed_at = NULL WHERE id IN (SELECT block_id FROM lib_trashed_files WHERE path_rel IN (${marks}))`, chunk)
    await d.execute(`INSERT OR IGNORE INTO lib_files (${FILE_COLS}) SELECT ${FILE_COLS} FROM lib_trashed_files WHERE path_rel IN (${marks})`, chunk)
    await d.execute(`DELETE FROM lib_trashed_files WHERE path_rel IN (${marks})`, chunk)
  })
}

interface TrashRow {
  key: string
  block_id: string
  source: Source
  owner: string
  board: string | null
  rel: string
  kind: FileKind
  thumb: string | null
  thumb_ok: number
  n: number
  trashed_at: string
}

/** Tout ce qui est à la corbeille (images entières et images seules de carrousels), du plus récemment supprimé au plus ancien. */
export async function loadTrash(): Promise<TrashedItem[]> {
  const d = await getDb()
  const blocks = await d.select<TrashRow[]>(
    `SELECT b.id AS key, b.id AS block_id, b.source, b.owner, b.board, b.trashed_at, f.path_rel AS rel, f.kind, f.thumb, f.thumb_ok,
            (SELECT COUNT(*) FROM lib_files x WHERE x.block_id = b.id) AS n
     FROM lib_blocks b
     JOIN lib_files f ON f.block_id = b.id AND f.position = (SELECT MIN(position) FROM lib_files WHERE block_id = b.id)
     WHERE b.trashed_at IS NOT NULL`,
  )
  const files = await d.select<TrashRow[]>(
    `SELECT t.path_rel AS key, t.block_id, b.source, b.owner, b.board, t.trashed_at, t.path_rel AS rel, t.kind, t.thumb, t.thumb_ok, 1 AS n
     FROM lib_trashed_files t JOIN lib_blocks b ON b.id = t.block_id`,
  )
  const toItem = (type: 'block' | 'file') => (r: TrashRow): TrashedItem => ({
    key: r.key,
    type,
    blockId: r.block_id,
    source: r.source,
    owner: r.owner,
    board: r.board,
    rel: r.rel,
    kind: r.kind,
    thumb: r.thumb_ok === 1 ? r.thumb : null,
    count: r.n,
    trashedAt: r.trashed_at,
  })
  return sortTrash([...blocks.map(toItem('block')), ...files.map(toItem('file'))])
}

export async function trashCount(): Promise<number> {
  const d = await getDb()
  const [row] = await d.select<{ n: number }[]>(
    'SELECT (SELECT COUNT(*) FROM lib_blocks WHERE trashed_at IS NOT NULL) + (SELECT COUNT(*) FROM lib_trashed_files) AS n',
  )
  return row.n
}

/** Les chemins que la mise à jour de la bibliothèque ne doit pas réimporter : images de carrousel à la corbeille ou supprimées définitivement. */
export async function loadRemovedRels(): Promise<Set<string>> {
  const d = await getDb()
  const rows = await d.select<{ rel: string }[]>('SELECT path_rel AS rel FROM lib_trashed_files UNION SELECT path_rel AS rel FROM lib_forgotten_files')
  return new Set(rows.map((r) => r.rel))
}

interface Outcome {
  rel: string
  ok: boolean
  error: string | null
}

/**
 * Supprime définitivement des images : leurs fichiers partent dans la Corbeille Windows, puis Form les oublie (et ne les réimportera plus).
 * Une image dont un fichier n'a pas pu partir reste dans la corbeille de Form.
 */
export async function deleteForever(ids: readonly string[], root: string): Promise<{ deleted: number; failed: number }> {
  const d = await getDb()
  let deleted = 0
  let failed = 0
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200)
    const files: { rel: string; block: string }[] = []
    await inChunks([...batch], async (marks, chunk) => {
      // Ses fichiers, y compris ceux déjà mis à la corbeille un par un.
      files.push(...(await d.select<{ rel: string; block: string }[]>(
        `SELECT path_rel AS rel, block_id AS block FROM lib_files WHERE block_id IN (${marks})
         UNION SELECT path_rel AS rel, block_id AS block FROM lib_trashed_files WHERE block_id IN (${marks})`,
        chunk,
      )))
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
      await d.execute(`DELETE FROM lib_trashed_files WHERE block_id IN (${marks})`, chunk)
      await d.execute(`DELETE FROM lib_block_types WHERE block_id IN (${marks})`, chunk)
      await d.execute(`DELETE FROM lib_block_collections WHERE block_id IN (${marks})`, chunk)
      await d.execute(`DELETE FROM lib_links WHERE block_a IN (${marks}) OR block_b IN (${marks})`, chunk)
      await d.execute(`DELETE FROM lib_blocks WHERE id IN (${marks})`, chunk)
    })
    for (const id of done) await d.execute('INSERT OR IGNORE INTO lib_forgotten (block_id, deleted_at) VALUES ($1, $2)', [id, now])
  }
  return { deleted, failed }
}

/**
 * Supprime définitivement des images prises dans des carrousels : seuls ces fichiers partent dans la Corbeille Windows, les autres images du carrousel restent.
 * Un carrousel qui n'a plus aucune image disparaît avec elles (et ne sera pas réimporté).
 */
export async function deleteFilesForever(rels: readonly string[], root: string): Promise<{ deleted: number; failed: number }> {
  const d = await getDb()
  let deleted = 0
  let failed = 0
  for (let i = 0; i < rels.length; i += 200) {
    const batch = rels.slice(i, i + 200)
    const outcomes = await invoke<Outcome[]>('trash_files', { root, rels: batch })
    const gone = outcomes.filter((o) => o.ok).map((o) => o.rel)
    failed += outcomes.filter((o) => !o.ok).length
    deleted += gone.length
    if (gone.length === 0) continue
    const blocks = new Set<string>()
    const now = new Date().toISOString()
    await inChunks([...gone], async (marks, chunk) => {
      const owners = await d.select<{ block: string }[]>(
        `SELECT block_id AS block FROM lib_files WHERE path_rel IN (${marks}) UNION SELECT block_id AS block FROM lib_trashed_files WHERE path_rel IN (${marks})`,
        chunk,
      )
      for (const r of owners) blocks.add(r.block)
      await d.execute(`DELETE FROM lib_embeddings WHERE path_rel IN (${marks})`, chunk)
      await d.execute(`DELETE FROM lib_colors WHERE path_rel IN (${marks})`, chunk)
      await d.execute(`DELETE FROM lib_files WHERE path_rel IN (${marks})`, chunk)
      await d.execute(`DELETE FROM lib_trashed_files WHERE path_rel IN (${marks})`, chunk)
    })
    // Ces fichiers ne reviennent pas, même si un nouveau téléchargement les remet dans le dossier.
    await multiInsert('lib_forgotten_files', ['path_rel', 'deleted_at'], gone.map((rel) => [rel, now]), { verb: 'INSERT OR IGNORE' })
    // Un carrousel dont toutes les images sont parties n'existe plus : on l'oublie comme une image supprimée.
    const empty: string[] = []
    await inChunks([...blocks], async (marks, chunk) => {
      empty.push(...(await d.select<{ id: string }[]>(
        `SELECT id FROM lib_blocks WHERE id IN (${marks}) AND NOT EXISTS (SELECT 1 FROM lib_files WHERE block_id = lib_blocks.id)
           AND NOT EXISTS (SELECT 1 FROM lib_trashed_files WHERE block_id = lib_blocks.id)`,
        chunk,
      )).map((r) => r.id))
    })
    await inChunks([...empty], async (marks, chunk) => {
      await d.execute(`DELETE FROM lib_block_types WHERE block_id IN (${marks})`, chunk)
      await d.execute(`DELETE FROM lib_block_collections WHERE block_id IN (${marks})`, chunk)
      await d.execute(`DELETE FROM lib_links WHERE block_a IN (${marks}) OR block_b IN (${marks})`, chunk)
      await d.execute(`DELETE FROM lib_blocks WHERE id IN (${marks})`, chunk)
    })
    for (const id of empty) await d.execute('INSERT OR IGNORE INTO lib_forgotten (block_id, deleted_at) VALUES ($1, $2)', [id, now])
  }
  return { deleted, failed }
}

/** Les identifiants des images supprimées définitivement. */
export async function loadForgotten(): Promise<Set<string>> {
  const d = await getDb()
  const rows = await d.select<{ block_id: string }[]>('SELECT block_id FROM lib_forgotten')
  return new Set(rows.map((r) => r.block_id))
}
