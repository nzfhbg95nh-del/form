import { describe, expect, it } from 'vitest'
import { backupFileName, DEFAULT_KEEP, joinPath, parseKeep, runDailyBackup, todayISO } from './backup'
import type { Repo } from './types'

function fakeRepo(settings: Record<string, string>) {
  const copies: string[] = []
  const repo = {
    getSetting: async (k: string) => settings[k] ?? null,
    setSetting: async (k: string, v: string) => { settings[k] = v },
    backupTo: async (p: string) => { copies.push(p) },
  } as unknown as Repo
  return { repo, copies }
}

describe('sauvegarde quotidienne', () => {
  it('formate la date et le nom de fichier', () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(backupFileName('2026-01-05')).toBe('form-sauvegarde-2026-01-05.db')
    expect(joinPath('C:\\Sauve\\', 'a.db')).toBe('C:\\Sauve\\a.db')
  })

  it('ne fait rien sans dossier choisi', async () => {
    const { repo, copies } = fakeRepo({})
    expect(await runDailyBackup(repo)).toBeNull()
    expect(copies).toHaveLength(0)
  })

  it("se rabat sur le dossier par défaut quand le dossier retenu n'existe pas sur cet ordinateur", async () => {
    const settings: Record<string, string> = { backup_dir: 'C:\\Users\\ancien-profil\\Documents\\Form sauvegardes' }
    const copies: string[] = []
    const repo = {
      getSetting: async (k: string) => settings[k] ?? null,
      setSetting: async (k: string, v: string) => { settings[k] = v },
      backupTo: async (p: string) => {
        if (p.includes('ancien-profil')) throw new Error('dossier introuvable')
        copies.push(p)
      },
    } as unknown as Repo
    expect(await runDailyBackup(repo, async () => 'C:\\Users\\NOE\\Documents\\Form sauvegardes')).toBe(todayISO())
    expect(copies).toEqual([`C:\\Users\\NOE\\Documents\\Form sauvegardes\\${backupFileName(todayISO())}`])
    expect(settings.backup_dir).toBe('C:\\Users\\NOE\\Documents\\Form sauvegardes')
    expect(settings.last_backup_date).toBe(todayISO())
  })

  it("laisse remonter l'erreur quand il n'y a pas d'autre dossier à essayer", async () => {
    const repo = {
      getSetting: async (k: string) => (k === 'backup_dir' ? 'C:\\Perdu' : null),
      setSetting: async () => undefined,
      backupTo: async () => { throw new Error('dossier introuvable') },
    } as unknown as Repo
    await expect(runDailyBackup(repo, null)).rejects.toThrow('dossier introuvable')
    await expect(runDailyBackup(repo, async () => 'C:\\Perdu')).rejects.toThrow('dossier introuvable')
  })

  it("sauvegarde une seule fois par jour", async () => {
    const { repo, copies } = fakeRepo({ backup_dir: 'C:\\Sauve' })
    expect(await runDailyBackup(repo)).toBe(todayISO())
    expect(await runDailyBackup(repo)).toBeNull()
    expect(copies).toHaveLength(1)
  })
})


describe('nombre de sauvegardes à garder', () => {
  it('accepte un entier entre 5 et 365, sinon 30', () => {
    expect(parseKeep('60')).toBe(60)
    expect(parseKeep('5')).toBe(5)
    expect(parseKeep('365')).toBe(365)
    expect(parseKeep('4')).toBe(DEFAULT_KEEP)
    expect(parseKeep('400')).toBe(DEFAULT_KEEP)
    expect(parseKeep('12.5')).toBe(DEFAULT_KEEP)
    expect(parseKeep('abc')).toBe(DEFAULT_KEEP)
    expect(parseKeep(null)).toBe(30)
  })
})
