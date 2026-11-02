import { isTauri } from './repo'
import type { Repo } from './types'

export function todayISO(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function backupFileName(date: string): string {
  return `form-sauvegarde-${date}.db`
}

export function joinPath(dir: string, file: string): string {
  return dir.replace(/[\\/]+$/, '') + '\\' + file
}

/** Sauvegarde dans `dir`. SQLite refuse d'écraser un fichier : si celui d'aujourd'hui existe déjà (autre sauvegarde faite plus tôt), on en fait un autre, daté à la seconde près. */
async function backupInto(repo: Repo, dir: string, today: string, now = new Date()): Promise<void> {
  try {
    await repo.backupTo(joinPath(dir, backupFileName(today)))
  } catch (e) {
    if (!/already exists/i.test(String(e))) throw e
    const p = (n: number) => String(n).padStart(2, '0')
    await repo.backupTo(joinPath(dir, backupFileName(`${today}-${p(now.getHours())}h${p(now.getMinutes())}m${p(now.getSeconds())}`)))
  }
}

/**
 * Les dossiers où ranger les sauvegardes, du préféré au dernier recours : « sauvegardes » dans la bibliothèque (elles la suivent quand on la
 * déplace), puis « Documents\Form sauvegardes » si la bibliothèque est introuvable (disque débranché, autre ordinateur…).
 */
export async function backupDirs(repo: Repo): Promise<string[]> {
  const library = (await repo.getSetting('library_root')) ?? null
  return invoke<string[]>('backup_dirs', { library })
}

/** Sauvegarde quotidienne : au plus une fois par jour, dans le premier dossier qui marche. */
export async function runDailyBackup(
  repo: Repo,
  dirsOf: (() => Promise<string[]>) | null = isTauri() ? () => backupDirs(repo) : null,
): Promise<string | null> {
  // Hors de l'application Windows : seulement le dossier retenu dans les réglages, s'il y en a un.
  const dirs = dirsOf ? await dirsOf() : [await repo.getSetting('backup_dir')].filter((d): d is string => !!d)
  if (dirs.length === 0) return null
  const today = todayISO()
  if ((await repo.getSetting('last_backup_date')) === today) return null
  let dir: string | null = null
  let failure: unknown = null
  for (const candidate of dirs) {
    try {
      await backupInto(repo, candidate, today)
      dir = candidate
      break
    } catch (e) {
      failure = e
    }
  }
  if (dir === null) throw failure
  // Le dossier réellement utilisé est retenu (pour l'affichage des Réglages et le diagnostic).
  await repo.setSetting('backup_dir', dir)
  await repo.setSetting('last_backup_date', today)
  // Ménage : on ne garde que les plus récentes (une erreur de ménage ne doit jamais faire échouer la sauvegarde).
  try {
    await pruneBackups(dir, parseKeep(await repo.getSetting('backup_keep')))
  } catch { /* sans importance */ }
  return today
}

export const DEFAULT_KEEP = 30

/** Nombre de sauvegardes automatiques à garder : un entier entre 5 et 365 (30 par défaut). */
export function parseKeep(raw: string | null | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 5 && n <= 365 ? n : DEFAULT_KEEP
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: call } = await import('@tauri-apps/api/core')
  try {
    return await call<T>(command, args)
  } catch (e) {
    throw new Error(typeof e === 'string' ? e : e instanceof Error ? e.message : String(e))
  }
}

/** Supprime les plus anciennes sauvegardes automatiques du dossier (seulement les `form-sauvegarde-*.db`). */
export async function pruneBackups(dir: string, keep: number): Promise<number> {
  if (!isTauri()) return 0
  return invoke<number>('prune_backups', { dir, keep })
}

/**
 * Prépare la restauration d'une sauvegarde puis redémarre l'application : elle s'applique au démarrage,
 * l'ancienne base est gardée sous le nom « form.avant-restauration-… ».
 */
export async function restoreBackup(source: string): Promise<void> {
  await invoke<void>('stage_restore', { source })
  await invoke<void>('restart_app')
}
