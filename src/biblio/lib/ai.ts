// IA locale : modèle d'images, empreintes. Le calcul se fait côté Rust ; ici, la base et les commandes.

import { invoke } from '@tauri-apps/api/core'
import { getDb, multiInsert } from './db.ts'

export const MODEL_ID = 'clip-vit-b32'

export interface AiStatus {
  model_ready: boolean
  model_size: number
  downloaded: number
  downloading: boolean
  embedding: boolean
}

export interface EmbedResult {
  rel: string
  vec: string
}

export const getAiStatus = () => invoke<AiStatus>('ai_status')
export const downloadModel = () => invoke<boolean>('ai_download_model')

export async function embeddingCounts(): Promise<{ embedded: number; pending: number }> {
  const d = await getDb()
  const [row] = await d.select<{ embedded: number; pending: number }[]>(
    `SELECT
       (SELECT COUNT(*) FROM lib_embeddings WHERE model = $1) AS embedded,
       (SELECT COUNT(*) FROM lib_files f WHERE f.thumb_ok = 1 AND f.missing = 0 AND NOT EXISTS (SELECT 1 FROM lib_embeddings e WHERE e.path_rel = f.path_rel AND e.model = $1)) AS pending`,
    [MODEL_ID],
  )
  return row
}

/** Lance le calcul pour les miniatures prêtes qui n'ont pas encore d'empreinte. `false` s'il n'y a rien à faire ou si un calcul tourne déjà. */
export async function startEmbeddings(): Promise<boolean> {
  const d = await getDb()
  const jobs = await d.select<{ rel: string; thumb: string }[]>(
    `SELECT f.path_rel AS rel, f.thumb FROM lib_files f
     WHERE f.thumb_ok = 1 AND f.missing = 0 AND f.thumb IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM lib_embeddings e WHERE e.path_rel = f.path_rel AND e.model = $1)`,
    [MODEL_ID],
  )
  if (jobs.length === 0) return false
  return invoke<boolean>('ai_start_embeddings', { jobs })
}

export async function saveEmbeddings(results: EmbedResult[]) {
  if (results.length === 0) return
  const now = new Date().toISOString()
  await multiInsert(
    'lib_embeddings',
    ['path_rel', 'model', 'dim', 'vec', 'created_at'],
    results.map((r) => [r.rel, MODEL_ID, 512, r.vec, now]),
    { verb: 'INSERT OR REPLACE' },
  )
}
