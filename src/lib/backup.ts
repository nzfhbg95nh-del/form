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

/** Sauvegarde quotidienne : au plus une fois par jour, seulement si un dossier est choisi. */
export async function runDailyBackup(repo: Repo): Promise<string | null> {
  const dir = await repo.getSetting('backup_dir')
  if (!dir) return null
  const today = todayISO()
  if ((await repo.getSetting('last_backup_date')) === today) return null
  await repo.backupTo(joinPath(dir, backupFileName(today)))
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
