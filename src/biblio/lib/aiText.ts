// Modèle de texte : téléchargement et empreintes des descriptions (gardées en base).

import { invoke } from '@tauri-apps/api/core'
import { MODEL_ID } from './ai.ts'
import { getDb } from './db.ts'
import { decodeVector } from './vectors.ts'

export interface TextStatus {
  ready: boolean
  total: number
  downloaded: number
  downloading: boolean
}

export const getTextStatus = () => invoke<TextStatus>('ai_text_status')
export const downloadText = () => invoke<boolean>('ai_download_text')

/** Les empreintes de ces descriptions : celles déjà calculées viennent de la base, les autres du modèle de texte. */
export async function textVectors(texts: string[]): Promise<Map<string, Float32Array>> {
  const d = await getDb()
  const unique = [...new Set(texts)]
  const cached = await d.select<{ text: string; vec: string }[]>('SELECT text, vec FROM lib_text_embeddings WHERE model = $1', [MODEL_ID])
  const out = new Map<string, Float32Array>()
  for (const row of cached) if (unique.includes(row.text)) out.set(row.text, decodeVector(row.vec))
  const missing = unique.filter((t) => !out.has(t))
  if (missing.length > 0) {
    const encoded = await invoke<string[]>('ai_encode_texts', { texts: missing })
    for (const [i, text] of missing.entries()) {
      await d.execute('INSERT OR REPLACE INTO lib_text_embeddings (text, model, dim, vec) VALUES ($1, $2, $3, $4)', [text, MODEL_ID, 512, encoded[i]])
      out.set(text, decodeVector(encoded[i]))
    }
  }
  return out
}
