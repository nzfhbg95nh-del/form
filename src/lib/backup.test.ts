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
