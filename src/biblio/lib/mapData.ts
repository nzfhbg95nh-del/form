// La carte : calcul (en arrière-plan), enregistrement et relecture des positions des images.

import { getDb, multiInsert } from './db.ts'
import { blockMeans, placeNewcomers } from './mapLayout.ts'
import type { MapWorkerInput, MapWorkerOutput } from './map.worker.ts'
import { getSearchIndex } from './searchIndex.ts'

export interface MapData {
  /** Les identifiants des blocs placés. */
  ids: string[]
  /** Leurs positions (x, y), l'une après l'autre. */
  xy: Float32Array
  /** Empreinte moyenne de chaque bloc (pour retrouver les voisins), alignée sur `ids`. */
  vectors: Float32Array
  dim: number
}

export type MapProgress = (phase: string, fraction: number) => void

async function readPositions(): Promise<Map<string, [number, number]>> {
  const d = await getDb()
  const rows = await d.select<{ block_id: string; x: number; y: number }[]>('SELECT block_id, x, y FROM lib_map')
  return new Map(rows.map((r) => [r.block_id, [r.x, r.y]]))
}

async function savePositions(ids: string[], xy: Float32Array, replace: boolean) {
  const d = await getDb()
  if (replace) await d.execute('DELETE FROM lib_map')
  const rows = ids.map((id, i) => [id, xy[2 * i], xy[2 * i + 1]])
  await multiInsert('lib_map', ['block_id', 'x', 'y'], rows, { verb: 'INSERT OR REPLACE' })
}

/** Calcule toute la carte dans un worker puis l'enregistre. */
export function computeMap(onProgress?: MapProgress): Promise<MapData> {
  return (async () => {
    onProgress?.('Lecture des empreintes', 0)
    const index = await getSearchIndex()
    if (index.dim === 0 || index.ids.length === 0) return { ids: [], xy: new Float32Array(0), vectors: new Float32Array(0), dim: 0 }
    const vectors = blockMeans(index.matrix, index.dim, index.blockOf, index.ids.length)
    const xy = await new Promise<Float32Array>((resolve, reject) => {
      const worker = new Worker(new URL('./map.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<MapWorkerOutput>) => {
        if (e.data.kind === 'progress') onProgress?.(e.data.phase, e.data.fraction)
        else {
          worker.terminate()
          resolve(e.data.xy)
        }
      }
      worker.onerror = (e) => {
        worker.terminate()
        reject(new Error(e.message || 'Le calcul de la carte a échoué.'))
      }
      const msg: MapWorkerInput = { vectors: vectors.slice(), n: index.ids.length, d: index.dim }
      worker.postMessage(msg)
    })
    onProgress?.('Enregistrement', 0.99)
    await savePositions(index.ids, xy, true)
    return { ids: index.ids, xy, vectors, dim: index.dim }
  })()
}

/**
 * Relit la carte enregistrée. Les images qui n'y sont pas encore (nouvelles, ou dont l'empreinte vient d'être calculée)
 * sont placées près de leurs voisines et enregistrées. Renvoie null s'il n'y a pas encore de carte.
 */
export async function loadMap(): Promise<MapData | null> {
  const saved = await readPositions()
  if (saved.size === 0) return null
  const index = await getSearchIndex()
  if (index.dim === 0) return null
  const dim = index.dim
  const all = blockMeans(index.matrix, dim, index.blockOf, index.ids.length)
  const placedIdx: number[] = []
  const freshIdx: number[] = []
  index.ids.forEach((id, i) => (saved.has(id) ? placedIdx : freshIdx).push(i))
  const xy = new Float32Array(index.ids.length * 2)
  placedIdx.forEach((i) => {
    const p = saved.get(index.ids[i])!
    xy[2 * i] = p[0]
    xy[2 * i + 1] = p[1]
  })
  if (freshIdx.length > 0 && placedIdx.length > 0) {
    const pPos = new Float32Array(placedIdx.length * 2)
    const pVec = new Float32Array(placedIdx.length * dim)
    placedIdx.forEach((i, j) => {
      pPos[2 * j] = xy[2 * i]
      pPos[2 * j + 1] = xy[2 * i + 1]
      pVec.set(all.subarray(i * dim, (i + 1) * dim), j * dim)
    })
    const fVec = new Float32Array(freshIdx.length * dim)
    freshIdx.forEach((i, j) => fVec.set(all.subarray(i * dim, (i + 1) * dim), j * dim))
    const out = placeNewcomers(pPos, pVec, placedIdx.length, dim, fVec, freshIdx.length)
    freshIdx.forEach((i, j) => {
      xy[2 * i] = out[2 * j]
      xy[2 * i + 1] = out[2 * j + 1]
    })
    await savePositions(
      freshIdx.map((i) => index.ids[i]),
      out,
      false,
    )
  }
  return { ids: index.ids, xy, vectors: all, dim }
}
