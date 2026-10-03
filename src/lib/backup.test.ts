import { describe, expect, it } from 'vitest'
import { backupFileName, joinPath, runDailyBackup, todayISO } from './backup'
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
