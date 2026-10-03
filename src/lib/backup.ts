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
  return today
}
