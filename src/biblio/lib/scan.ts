// Lecture des chemins de Social Saver : tout vient de l'arborescence et des noms de fichiers.
// Logique « pure » (rien ne touche au disque ni à l'écran), testée automatiquement.
//
//   instagram/<auteur>/<AAAAMMJJ>_<code>_<NN>.<ext>
//   pinterest/<propriétaire>/<tableau>/<id_du_pin>.<ext>
//
// Constat : sur Instagram, le code change à chaque image d'un même carrousel (il n'identifie pas le post).
// Un carrousel = les fichiers du même auteur et de la même date, dans l'ordre du numéro NN.

export type Source = 'instagram' | 'pinterest' | 'manual'
export type FileKind = 'image' | 'video'
export type BlockKind = 'image' | 'video' | 'carousel'

export interface ScannedFile {
  rel: string
  size: number
  mtime: number
}

export interface BlockFile {
  rel: string
  position: number
  kind: FileKind
  size: number
  mtime: number
}

export interface BlockDraft {
  id: string
  source: Source
  owner: string
  board: string | null
  originId: string
  originUrl: string
  kind: BlockKind
  /** AAAA-MM-JJ (Instagram seulement). */
  publishedAt: string | null
  collectionIds: string[]
  files: BlockFile[]
}

export interface CollectionDraft {
  id: string
  name: string
  kind: Source
  owner: string
}

const VIDEO_EXT = new Set(['mp4', 'm4v', 'mov', 'webm'])

const IG_RE = /^instagram\/([^/]+)\/(\d{8})_([\w-]+)_(\d+)\.(\w+)$/
const PIN_RE = /^pinterest\/([^/]+)\/(.+)\/([^/]+)\.(\w+)$/

const MANUAL_PREFIX = 'ajouts/'
export const MANUAL_COLLECTION = 'man:ajouts'

export const fileKindOf = (ext: string): FileKind => (VIDEO_EXT.has(ext.toLowerCase()) ? 'video' : 'image')

interface IgFile {
  file: ScannedFile
  author: string
  date: string
  n: number
}
export const igCollectionId = (author: string) => `ig:${author}`
export const pinCollectionId = (owner: string, board: string) => `pin:${owner}/${board}`
export const instagramProfileUrl = (author: string) => `https://www.instagram.com/${author}/`
export const pinterestPinUrl = (pinId: string) => `https://www.pinterest.com/pin/${pinId}/`

const toBlockFile = (f: ScannedFile, position: number): BlockFile => ({
  rel: f.rel,
  position,
  kind: fileKindOf(f.rel.slice(f.rel.lastIndexOf('.') + 1)),
  size: f.size,
  mtime: f.mtime,
})

const blockKind = (files: BlockFile[]): BlockKind => (files.length > 1 ? 'carousel' : files[0].kind)

const isoDate = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`

/** Regroupe les fichiers en blocs et en collections automatiques. Résultat déterministe (trié par chemin). */
export function buildBlocks(files: ScannedFile[]): { blocks: BlockDraft[]; collections: CollectionDraft[] } {
  const sorted = [...files].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  const blocks: BlockDraft[] = []
  const collections = new Map<string, CollectionDraft>()
  const igGroups = new Map<string, IgFile[]>()
  const usedIds = new Set<string>()

  for (const file of sorted) {
    // Une image ajoutée à la main : un bloc à elle, dans la collection « Mes ajouts ».
    if (file.rel.startsWith(MANUAL_PREFIX)) {
      const name = file.rel.slice(MANUAL_PREFIX.length)
      const stem = name.replace(/\.\w+$/, '')
      collections.set(MANUAL_COLLECTION, { id: MANUAL_COLLECTION, name: 'Mes ajouts', kind: 'manual', owner: 'Mes ajouts' })
      const bf = [toBlockFile(file, 0)]
      blocks.push({
        id: `man:${stem}`,
        source: 'manual',
        owner: 'Mes ajouts',
        board: null,
        originId: stem,
        originUrl: '',
        kind: blockKind(bf),
        publishedAt: new Date(file.mtime || Date.now()).toISOString().slice(0, 10),
        collectionIds: [MANUAL_COLLECTION],
        files: bf,
      })
      continue
    }
    const ig = IG_RE.exec(file.rel)
    if (ig) {
      const [, author, date, , n] = ig
      const key = `${author}|${date}`
      const list = igGroups.get(key) ?? []
      list.push({ file, author, date, n: Number(n) })
      igGroups.set(key, list)
      continue
    }
    const pin = PIN_RE.exec(file.rel)
    if (pin) {
      const [, owner, board, pinId] = pin
      const collectionId = pinCollectionId(owner, board)
      collections.set(collectionId, { id: collectionId, name: board, kind: 'pinterest', owner })
      // Le même pin enregistré dans deux tableaux donne deux blocs (doublon à signaler plus tard).
      let id = `pin:${pinId}`
      if (usedIds.has(id)) id = `pin:${pinId}:${owner}/${board}`
      usedIds.add(id)
      const bf = [toBlockFile(file, 0)]
      blocks.push({
        id,
        source: 'pinterest',
        owner,
        board,
        originId: pinId,
        originUrl: pinterestPinUrl(pinId),
        kind: blockKind(bf),
        publishedAt: null,
        collectionIds: [collectionId],
        files: bf,
      })
    }
  }

  for (const list of igGroups.values()) {
    list.sort((a, b) => a.n - b.n || (a.file.rel < b.file.rel ? -1 : 1))
    // Deux posts du même jour : le numéro repart de 1, on ouvre un nouveau bloc.
    const groups: IgFile[][] = []
    for (const item of list) {
      const current = groups[groups.length - 1]
      const last = current?.[current.length - 1]
      if (!current || (last && item.n <= last.n)) groups.push([item])
      else current.push(item)
    }
    groups.forEach((group, index) => {
      const { author, date } = group[0]
      const collectionId = igCollectionId(author)
      collections.set(collectionId, { id: collectionId, name: author, kind: 'instagram', owner: author })
      const id = `ig:${author}:${date}${index > 0 ? `:${index + 1}` : ''}`
      const bf = group.map((g, i) => toBlockFile(g.file, i))
      blocks.push({
        id,
        source: 'instagram',
        owner: author,
        board: null,
        originId: `${date}${index > 0 ? `:${index + 1}` : ''}`,
        originUrl: instagramProfileUrl(author),
        kind: blockKind(bf),
        publishedAt: isoDate(date),
        collectionIds: [collectionId],
        files: bf,
      })
    })
  }

  blocks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { blocks, collections: [...collections.values()] }
}

export interface DiffResult {
  /** Fichiers vus sur le disque et pas encore en base. */
  added: ScannedFile[]
  /** Fichiers en base qui ont disparu du disque (déplacés dans la corbeille, par exemple). */
  missing: string[]
  /** Fichiers marqués introuvables qui sont revenus. */
  restored: string[]
}

export function diffFiles(scanned: ScannedFile[], known: { rel: string; missing: number }[]): DiffResult {
  const onDisk = new Set(scanned.map((f) => f.rel))
  const inDb = new Map(known.map((k) => [k.rel, k.missing]))
  return {
    added: scanned.filter((f) => !inDb.has(f.rel)),
    missing: known.filter((k) => !k.missing && !onDisk.has(k.rel)).map((k) => k.rel),
    restored: known.filter((k) => k.missing && onDisk.has(k.rel)).map((k) => k.rel),
  }
}

/** Retire les blocs que Victor a supprimés définitivement (même si Social Saver remet un jour leurs fichiers). */
export function dropForgotten(blocks: BlockDraft[], forgotten: ReadonlySet<string>): BlockDraft[] {
  return forgotten.size === 0 ? blocks : blocks.filter((b) => !forgotten.has(b.id))
}
