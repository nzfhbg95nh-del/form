// Doublons : lecture des fichiers de la bibliothèque, recherche (faite par le programme, voir `dupes.rs`) et petits calculs pour la page « Doublons ».
// La recherche ne supprime rien ; la suppression passe par la corbeille de la bibliothèque (fichiers dans la Corbeille Windows).

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getDb } from './db.ts'
import type { Source } from './scan.ts'

export type DupeMode = 'exact' | 'near'

/** Écart d'empreinte (en bits sur 64) toléré entre deux images quasi identiques. */
export const DISTANCES: { id: number; label: string }[] = [
  { id: 2, label: 'Stricte' },
  { id: 5, label: 'Normale (recommandé)' },
  { id: 8, label: 'Large' },
]
export const DEFAULT_DISTANCE = 5

export interface DupeMember {
  rel: string
  block: string
  kind: string
  size: number
  mtime: number
  width: number | null
  height: number | null
  thumb: string | null
  source: Source
  owner: string
  board: string | null
  /** Nombre de fichiers de son bloc : un carrousel (plusieurs fichiers) ne se supprime pas d'un coup depuis ici. */
  filesInBlock: number
}

export interface DupeGroup {
  id: number
  /** « exact » : même contenu ; « near » : quasi identiques. */
  kind: 'exact' | 'near'
  members: DupeMember[]
}

const pixels = (m: DupeMember) => (m.width ?? 0) * (m.height ?? 0)

/** L'image à garder par défaut : la plus grande, puis la plus lourde, puis la plus ancienne. */
export function pickKeeper(members: readonly DupeMember[]): string {
  const sorted = [...members].sort((a, b) => pixels(b) - pixels(a) || b.size - a.size || a.mtime - b.mtime || a.rel.localeCompare(b.rel))
  return sorted[0].rel
}

/** On ne supprime depuis ici que des images seules dans leur bloc (un carrousel perdrait ses autres images). */
export const isDeletable = (m: DupeMember) => m.filesInBlock === 1

/** Place gagnée si on ne garde que le plus gros fichier du groupe. */
export const wastedBytes = (g: DupeGroup) => g.members.reduce((n, m) => n + m.size, 0) - Math.max(...g.members.map((m) => m.size))

/** Les groupes qui font gagner le plus de place d'abord. */
export const orderGroups = (groups: readonly DupeGroup[]): DupeGroup[] => [...groups].sort((a, b) => wastedBytes(b) - wastedBytes(a) || a.id - b.id)

/** Choix de départ : on garde la meilleure image de chaque groupe ; les autres sont à supprimer, sauf celles qu'on ne peut pas supprimer d'ici. */
export function defaultChoices(groups: readonly DupeGroup[]): Map<string, 'keep' | 'delete'> {
  const out = new Map<string, 'keep' | 'delete'>()
  for (const g of groups) {
    const keeper = pickKeeper(g.members)
    for (const m of g.members) out.set(m.rel, m.rel !== keeper && isDeletable(m) ? 'delete' : 'keep')
  }
  return out
}

/** Les blocs à envoyer dans la Corbeille Windows : les images choisies « à supprimer » (jamais celles gardées, jamais un carrousel). */
export function blocksToDelete(groups: readonly DupeGroup[], choices: ReadonlyMap<string, 'keep' | 'delete'>): string[] {
  const out = new Set<string>()
  for (const g of groups) {
    const kept = g.members.filter((m) => choices.get(m.rel) !== 'delete')
    if (kept.length === 0) continue // sécurité : un groupe garde toujours au moins une image
    for (const m of g.members) if (choices.get(m.rel) === 'delete' && isDeletable(m)) out.add(m.block)
  }
  return [...out]
}

interface Row {
  rel: string
  block: string
  kind: string
  size: number
  mtime: number
  width: number | null
  height: number | null
  thumb: string | null
  thumb_ok: number
  source: Source
  owner: string
  board: string | null
  n: number
}

export interface ScanProgress {
  phase: string
  done: number
  total: number
}

/** Cherche les doublons dans toute la bibliothèque (hors corbeille). `distance` ne sert qu'en mode « quasi identiques ». */
export async function scanDuplicates(root: string, mode: DupeMode, distance: number, onProgress: (p: ScanProgress) => void): Promise<DupeGroup[]> {
  const d = await getDb()
  const rows = await d.select<Row[]>(
    `SELECT f.path_rel AS rel, f.block_id AS block, f.kind, f.size, f.mtime, f.width, f.height, f.thumb, f.thumb_ok, b.source, b.owner, b.board,
            (SELECT COUNT(*) FROM lib_files x WHERE x.block_id = f.block_id AND x.missing = 0) AS n
     FROM lib_files f JOIN lib_blocks b ON b.id = f.block_id
     WHERE f.missing = 0 AND b.trashed_at IS NULL`,
  )
  const byRel = new Map(rows.map((r) => [r.rel, r]))
  const files = rows.map((r) => ({ rel: r.rel, size: r.size, thumb: r.kind === 'image' && r.thumb_ok === 1 ? r.thumb : null }))
  const unlisten = await listen<ScanProgress>('dupes-progress', (e) => onProgress(e.payload))
  try {
    const found = await invoke<{ kind: 'exact' | 'near'; rels: string[] }[]>('dupes_scan', { root, files, maxDistance: mode === 'near' ? distance : null })
    const groups = found.map((g, i): DupeGroup => ({
      id: i,
      kind: g.kind,
      members: g.rels.flatMap((rel) => {
        const r = byRel.get(rel)
        return r
          ? [{ rel, block: r.block, kind: r.kind, size: r.size, mtime: r.mtime, width: r.width, height: r.height, thumb: r.thumb_ok === 1 ? r.thumb : null, source: r.source, owner: r.owner, board: r.board, filesInBlock: r.n }]
          : []
      }),
    }))
    return orderGroups(groups.filter((g) => g.members.length > 1))
  } finally {
    unlisten()
  }
}
