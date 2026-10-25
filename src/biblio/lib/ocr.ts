// Texte lu dans les vidéos (recettes, astuces…) : calcul en arrière-plan (Rust), enregistrement, relecture pour la recherche.

import { invoke } from '@tauri-apps/api/core'
import { getDb, multiInsert } from './db.ts'

export interface OcrResult {
  rel: string
  text: string
}

export async function ocrCounts(): Promise<{ done: number; withText: number; pending: number }> {
  const d = await getDb()
  const [row] = await d.select<{ done: number; withText: number; pending: number }[]>(
    `SELECT
       (SELECT COUNT(*) FROM lib_ocr) AS done,
       (SELECT COUNT(*) FROM lib_ocr WHERE text <> '') AS withText,
       (SELECT COUNT(*) FROM lib_files f WHERE f.kind = 'video' AND f.thumb_ok = 1 AND f.missing = 0 AND NOT EXISTS (SELECT 1 FROM lib_ocr o WHERE o.path_rel = f.path_rel)) AS pending`,
  )
  return row
}

/** Lance la lecture du texte des vidéos pas encore lues. `false` s'il n'y a rien à faire ou si un calcul tourne déjà. */
export async function startOcr(root: string): Promise<boolean> {
  const d = await getDb()
  const jobs = await d.select<{ rel: string; duration: number | null; every?: number }[]>(
    `SELECT f.path_rel AS rel, f.duration FROM lib_files f
     WHERE f.kind = 'video' AND f.thumb_ok = 1 AND f.missing = 0
       AND NOT EXISTS (SELECT 1 FROM lib_ocr o WHERE o.path_rel = f.path_rel)`,
  )
  if (jobs.length === 0) return false
  return invoke<boolean>('ocr_start', { root, jobs })
}

export async function saveOcr(results: OcrResult[]) {
  if (results.length === 0) return
  const now = new Date().toISOString()
  await multiInsert('lib_ocr', ['path_rel', 'text', 'created_at'], results.map((r) => [r.rel, r.text, now]), { verb: 'INSERT OR REPLACE' })
}

/** Bloc → tout le texte lu dans ses vidéos (pour la recherche). */
export async function loadOcrTexts(): Promise<Map<string, string>> {
  const d = await getDb()
  const rows = await d.select<{ block: string; text: string }[]>(
    "SELECT f.block_id AS block, o.text FROM lib_ocr o JOIN lib_files f ON f.path_rel = o.path_rel WHERE o.text <> ''",
  )
  const out = new Map<string, string>()
  for (const r of rows) out.set(r.block, `${out.get(r.block) ?? ''} ${r.text}`.slice(0, 4000))
  return out
}

/**
 * Relit en détail (une image toutes les 2 secondes) les vidéos des recettes, dont les ingrédients et les étapes s'affichent par petits bouts.
 * Le résultat remplace la première lecture.
 */
export async function startRecipeOcr(root: string): Promise<boolean> {
  const d = await getDb()
  const jobs = await d.select<{ rel: string; duration: number | null }[]>(
    `SELECT DISTINCT f.path_rel AS rel, f.duration FROM lib_files f
       JOIN lib_block_types bt ON bt.block_id = f.block_id JOIN lib_types t ON t.id = bt.type_id
     WHERE t.name = 'Recette' AND f.kind = 'video' AND f.thumb_ok = 1 AND f.missing = 0`,
  )
  if (jobs.length === 0) return false
  return invoke<boolean>('ocr_start', { root, jobs: jobs.map((j) => ({ ...j, every: 2 })) })
}
