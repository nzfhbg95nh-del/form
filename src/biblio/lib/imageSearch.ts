// Recherche par image : on donne une image (déposée, collée ou choisie), le modèle d'IA local en fait une empreinte, et on rend les blocs
// de la bibliothèque qui lui ressemblent le plus. Rien ne quitte l'ordinateur.

import { invoke } from '@tauri-apps/api/core'
import { bytesToBase64, fitSide } from './imageSearchPure.ts'
import { getSearchIndex } from './searchIndex.ts'
import { nearestBlocks } from './semanticSearch.ts'
import { decodeVector } from './vectors.ts'

/** Le plus grand côté de l'image envoyée au modèle : il la ramène à 224 px, inutile d'envoyer plus. */
const MAX_SIDE = 512

/** L'image réduite, en JPEG base64. */
async function toBase64(blob: Blob): Promise<string> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    throw new Error("Cette image n'est pas lisible (formats acceptés : JPEG, PNG, WebP, GIF…).")
  }
  const { w, h } = fitSide(bitmap.width, bitmap.height, MAX_SIDE)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("Impossible de préparer l'image.")
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!jpeg) throw new Error("Impossible de préparer l'image.")
  return bytesToBase64(new Uint8Array(await jpeg.arrayBuffer()))
}

/** Les identifiants des blocs qui ressemblent le plus à cette image, du plus ressemblant au moins ressemblant. */
export async function similarBlocksTo(image: Blob, k = 120): Promise<string[]> {
  const [data, index] = await Promise.all([toBase64(image), getSearchIndex()])
  if (!index.dim || index.ids.length === 0) throw new Error("Les empreintes des images ne sont pas encore calculées : Form les prépare tout seul après chaque mise à jour.")
  const vector = decodeVector(await invoke<string>('ai_embed_image', { data }))
  return nearestBlocks(vector, index.matrix, index.dim, index.blockOf, index.ids, '', k).map((n) => n.id)
}
