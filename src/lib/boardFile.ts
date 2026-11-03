// Un moodboard dans un seul fichier (.formboard) : ses éléments, leur place, le fond, le titre, l'image de couverture et toutes les images.
// Il se réimporte dans Form sur un autre ordinateur. Logique pure (testée) ; la lecture / l'écriture du fichier est dans boardTransfer.ts.

import { parseBoard, type Board } from './moodboard'
import type { BoardAsset } from './types'

export const BOARD_FILE_FORMAT = 'form-moodboard'
export const BOARD_FILE_VERSION = 1
export const BOARD_FILE_EXTENSION = 'formboard'

export type BoardFileAsset = Omit<BoardAsset, 'board_id'>

export interface BoardFile {
  format: typeof BOARD_FILE_FORMAT
  version: number
  exportedAt: string
  title: string
  icon: string | null
  /** L'image de couverture de la carte (identifiant d'une image du fichier), ou rien. */
  coverAsset: string | null
  board: Board
  assets: BoardFileAsset[]
}

export interface BoardSource {
  title: string
  icon: string | null
  content: string | null
  coverAsset: string | null
  assets: readonly BoardAsset[]
}

/** Le fichier d'un moodboard, prêt à être écrit (texte JSON). */
export function buildBoardFile(src: BoardSource, now = new Date()): string {
  const file: BoardFile = {
    format: BOARD_FILE_FORMAT,
    version: BOARD_FILE_VERSION,
    exportedAt: now.toISOString(),
    title: src.title.trim() || 'Moodboard',
    icon: src.icon,
    coverAsset: src.coverAsset,
    board: parseBoard(src.content),
    assets: src.assets.map(({ id, name, width, height, data_url, thumb_url, created_at }) => ({ id, name, width, height, data_url, thumb_url, created_at })),
  }
  return JSON.stringify(file)
}

export type ParsedBoardFile = { ok: true; file: BoardFile } | { ok: false; error: string }

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Lit le texte d'un fichier .formboard ; rend une phrase claire si ce n'est pas un moodboard Form ou s'il est abîmé. */
export function parseBoardFile(text: string): ParsedBoardFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Ce fichier est abîmé ou n’est pas un moodboard Form.' }
  }
  if (!isObject(data) || data.format !== BOARD_FILE_FORMAT) return { ok: false, error: 'Ce fichier n’est pas un moodboard Form.' }
  if (typeof data.version !== 'number' || data.version > BOARD_FILE_VERSION) return { ok: false, error: 'Ce moodboard vient d’une version plus récente de Form : mets Form à jour pour l’ouvrir.' }
  if (!isObject(data.board) || !Array.isArray(data.board.items)) return { ok: false, error: 'Le plan du moodboard est abîmé.' }
  if (!Array.isArray(data.assets)) return { ok: false, error: 'Les images du moodboard sont abîmées.' }
  const assets: BoardFileAsset[] = []
  for (const a of data.assets) {
    if (!isObject(a) || typeof a.id !== 'string' || !a.id || typeof a.data_url !== 'string' || !a.data_url) return { ok: false, error: 'Une image du moodboard est abîmée.' }
    assets.push({
      id: a.id,
      name: typeof a.name === 'string' ? a.name : '',
      width: Number(a.width) || 0,
      height: Number(a.height) || 0,
      data_url: a.data_url,
      thumb_url: typeof a.thumb_url === 'string' && a.thumb_url ? a.thumb_url : a.data_url,
      created_at: typeof a.created_at === 'string' ? a.created_at : new Date().toISOString(),
    })
  }
  const board = parseBoard(JSON.stringify(data.board))
  return {
    ok: true,
    file: {
      format: BOARD_FILE_FORMAT,
      version: data.version,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
      title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'Moodboard',
      icon: typeof data.icon === 'string' ? data.icon : null,
      coverAsset: typeof data.coverAsset === 'string' && assets.some((a) => a.id === data.coverAsset) ? data.coverAsset : null,
      board,
      assets,
    },
  }
}

/** Le titre d'un moodboard importé : le même, ou avec « (importé) » s'il existe déjà (puis « (importé 2) »…), pour ne jamais en écraser un. */
export function importedTitle(title: string, existing: readonly string[]): string {
  const taken = new Set(existing.map((t) => t.trim().toLowerCase()))
  if (!taken.has(title.trim().toLowerCase())) return title
  let n = 1
  for (;;) {
    const candidate = `${title} (importé${n > 1 ? ` ${n}` : ''})`
    if (!taken.has(candidate.toLowerCase())) return candidate
    n++
  }
}

/** Le nom proposé pour le fichier : le titre, sans les caractères interdits par Windows. */
export function boardFileName(title: string): string {
  const clean = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Moodboard'
  return `${clean}.${BOARD_FILE_EXTENSION}`
}
