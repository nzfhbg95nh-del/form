// Calcul de la carte dans un « worker » : l'interface reste fluide pendant le placement des images.

import { computeLayout } from './mapLayout.ts'

export interface MapWorkerInput {
  vectors: Float32Array
  n: number
  d: number
}

export type MapWorkerOutput = { kind: 'progress'; phase: string; fraction: number } | { kind: 'done'; xy: Float32Array }

const ctx = self as unknown as { onmessage: ((e: MessageEvent<MapWorkerInput>) => void) | null; postMessage: (m: MapWorkerOutput, t?: Transferable[]) => void }

ctx.onmessage = (e) => {
  const { vectors, n, d } = e.data
  let last = 0
  const xy = computeLayout(vectors, n, d, {}, (phase, fraction) => {
    const now = Date.now()
    if (now - last < 200) return
    last = now
    ctx.postMessage({ kind: 'progress', phase, fraction })
  })
  ctx.postMessage({ kind: 'done', xy }, [xy.buffer])
}
