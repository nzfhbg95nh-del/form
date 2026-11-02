import { formatBytes } from './vectors.ts'

/** Nom du dossier qui contient toute la bibliothèque (instagram, pinterest, images ajoutées, recettes, cache). */
export const LIBRARY_FOLDER_NAME = 'Bibliothèque Form'

export interface MovePreview {
  files: number
  bytes: number
  /** Place libre sur le disque de destination. */
  free: number | null
  ok: boolean
  error: string | null
}

export interface MoveProgress {
  done_files: number
  total_files: number
  done_bytes: number
  total_bytes: number
  current: string
}

export interface MoveResult {
  copied: number
  skipped: number
  failed: number
  bytes: number
  errors: string[]
  cancelled: boolean
}

export interface LayoutInfo {
  exists: boolean
  added_dir: string
  cache_in_library: boolean
  cache_dir: string | null
  recipes_dir: string
}

const nf = new Intl.NumberFormat('fr-FR')

/** Le dossier choisi dans la fenêtre devient « <dossier>\Bibliothèque Form », sauf s'il porte déjà ce nom. */
export function destinationFor(picked: string): string {
  const clean = picked.replace(/[\\/]+$/, '')
  const last = clean.split(/[\\/]/).pop() ?? ''
  if (last.toLowerCase() === LIBRARY_FOLDER_NAME.toLowerCase()) return clean
  return `${clean}\\${LIBRARY_FOLDER_NAME}`
}

/** « 17 073 fichiers · 11,32 Go · 682,40 Go libres ». */
export function describePreview(p: MovePreview): string {
  const free = p.free === null ? '' : ` · ${formatBytes(p.free)} libres sur le disque de destination`
  return `${nf.format(p.files)} fichier${p.files > 1 ? 's' : ''} · ${formatBytes(p.bytes)}${free}`
}

/** Avancement de 0 à 100, d'après les octets (ou les fichiers s'il n'y a rien de lourd). */
export function progressPercent(p: MoveProgress): number {
  const ratio = p.total_bytes > 0 ? p.done_bytes / p.total_bytes : p.total_files > 0 ? p.done_files / p.total_files : 0
  return Math.min(100, Math.max(0, Math.round(ratio * 100)))
}

export function describeProgress(p: MoveProgress): string {
  return `${nf.format(p.done_files)} / ${nf.format(p.total_files)} fichiers · ${formatBytes(p.done_bytes)} / ${formatBytes(p.total_bytes)}`
}

/** Le déplacement est-il allé au bout, sans erreur ni arrêt ? */
export function moveSucceeded(r: MoveResult): boolean {
  return r.failed === 0 && !r.cancelled
}

export function describeResult(r: MoveResult): string {
  if (r.cancelled) return `Déplacement arrêté : ${nf.format(r.copied)} fichiers copiés. Relance-le pour reprendre là où il s'est arrêté (rien n'est recopié deux fois).`
  if (r.failed > 0) return `${nf.format(r.failed)} fichier${r.failed > 1 ? 's' : ''} n'ont pas pu être copiés. La bibliothèque n'a pas changé d'emplacement : corrige le problème puis relance le déplacement (rien n'est recopié deux fois).`
  const skipped = r.skipped > 0 ? `, ${nf.format(r.skipped)} déjà présents` : ''
  return `${nf.format(r.copied)} fichiers copiés (${formatBytes(r.bytes)})${skipped}. L'ancien dossier est intact.`
}
