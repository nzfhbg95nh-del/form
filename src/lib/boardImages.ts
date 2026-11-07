// Exporter toutes les images d'un moodboard dans un dossier : quelles images, dans quel ordre, sous quels noms.
// Pur et testable ; l'écriture des fichiers est dans boardTransfer.ts.

import type { BoardItem } from './moodboard'

export interface ExportAsset {
  id: string
  data_url: string
}

export interface ExportFile {
  /** Nom du fichier dans le dossier : 001.webp, 002.jpg… */
  name: string
  assetId: string
  dataUrl: string
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
}

/** L'extension d'un fichier d'après l'en-tête d'une adresse « data: » (jpg si on ne sait pas). */
export function extensionOf(dataUrl: string): string {
  const mime = /^data:([^;,]+)/i.exec(dataUrl)?.[1]?.toLowerCase() ?? ''
  return EXTENSIONS[mime] ?? 'jpg'
}

/** Les octets d'une image stockée sous forme d'adresse « data: » (lue à la main : la fenêtre de Form refuse de « télécharger » une adresse data:). */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:') || comma < 0) throw new Error('Image illisible.')
  const head = dataUrl.slice(0, comma)
  const body = dataUrl.slice(comma + 1)
  if (/;base64/i.test(head)) {
    const bin = atob(body)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }
  return new TextEncoder().encode(decodeURIComponent(body))
}

/**
 * Les images posées sur la toile, dans l'ordre de lecture (de haut en bas, puis de gauche à droite), sans doublon :
 * une image posée deux fois n'est exportée qu'une fois. Ce sont les images d'origine, sans recadrage.
 */
export function planImageExport(items: readonly BoardItem[], assets: readonly ExportAsset[]): ExportFile[] {
  const byId = new Map(assets.map((a) => [a.id, a]))
  const seen = new Set<string>()
  const onBoard = items
    .filter((i) => i.kind === 'image' && i.assetId && byId.has(i.assetId))
    // Les lignes d'images à peu près à la même hauteur (à 40 px près) se lisent de gauche à droite.
    .sort((a, b) => Math.round(a.y / 40) - Math.round(b.y / 40) || a.x - b.x)
  const unique = onBoard.filter((i) => (seen.has(i.assetId as string) ? false : (seen.add(i.assetId as string), true)))
  const digits = Math.max(3, String(unique.length).length)
  return unique.map((item, i) => {
    const asset = byId.get(item.assetId as string) as ExportAsset
    return { name: `${String(i + 1).padStart(digits, '0')}.${extensionOf(asset.data_url)}`, assetId: asset.id, dataUrl: asset.data_url }
  })
}

/** Le nom du dossier créé : « Titre - images ». */
export function imagesFolderName(title: string): string {
  const clean = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\.+$/, '') || 'Moodboard'
  return `${clean} - images`
}
