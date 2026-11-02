import { describe, expect, it } from 'vitest'
import { backupFileName, DEFAULT_KEEP, joinPath, parseKeep, runDailyBackup, todayISO } from './backup'
import type { Repo } from './types'

const LIB = 'D:\\Bibliotheque\\sauvegardes'
const DOCS = 'C:\\Users\\NOE\\Documents\\Form sauvegardes'

function fakeRepo(settings: Record<string, string>, fail: (path: string) => Error | null = () => null) {
  const copies: string[] = []
  const repo = {
    getSetting: async (k: string) => settings[k] ?? null,
    setSetting: async (k: string, v: string) => { settings[k] = v },
    backupTo: async (p: string) => {
      const err = fail(p)
      if (err) throw err
      copies.push(p)
    },
  } as unknown as Repo
  return { repo, copies }
}

describe('sauvegarde quotidienne', () => {
  it('formate la date et le nom de fichier', () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(backupFileName('2026-01-05')).toBe('form-sauvegarde-2026-01-05.db')
    expect(joinPath('C:\\Sauve\\', 'a.db')).toBe('C:\\Sauve\\a.db')
  })

  it('ne fait rien sans dossier possible', async () => {
    const { repo, copies } = fakeRepo({})
    expect(await runDailyBackup(repo, null)).toBeNull()
    expect(await runDailyBackup(repo, async () => [])).toBeNull()
    expect(copies).toHaveLength(0)
  })

  it('range la sauvegarde dans le premier dossier (celui de la bibliothèque) et le retient', async () => {
    const settings: Record<string, string> = {}
    const { repo, copies } = fakeRepo(settings)
    expect(await runDailyBackup(repo, async () => [LIB, DOCS])).toBe(todayISO())
    expect(copies).toEqual([`${LIB}\\${backupFileName(todayISO())}`])
    expect(settings.backup_dir).toBe(LIB)
    expect(settings.last_backup_date).toBe(todayISO())
  })

  it("se rabat sur le dossier suivant quand le premier ne marche pas (bibliothèque débranchée)", async () => {
    const settings: Record<string, string> = {}
    const { repo, copies } = fakeRepo(settings, (p) => (p.startsWith('D:') ? new Error('dossier introuvable') : null))
    expect(await runDailyBackup(repo, async () => [LIB, DOCS])).toBe(todayISO())
    expect(copies).toEqual([`${DOCS}\\${backupFileName(todayISO())}`])
    expect(settings.backup_dir).toBe(DOCS)
  })

  it("fait une autre sauvegarde, datée à la seconde, quand celle d'aujourd'hui existe déjà (SQLite n'écrase jamais)", async () => {
    const settings: Record<string, string> = {}
    const { repo, copies } = fakeRepo(settings, (p) => (p.endsWith(backupFileName(todayISO())) ? new Error('error returned from database: (code: 1) output file already exists') : null))
    expect(await runDailyBackup(repo, async () => ['C:\\Sauve'])).toBe(todayISO())
    expect(copies).toHaveLength(1)
    expect(copies[0]).toMatch(/^C:\\Sauve\\form-sauvegarde-\d{4}-\d{2}-\d{2}-\d{2}h\d{2}m\d{2}\.db$/)
    expect(settings.last_backup_date).toBe(todayISO())
  })

  it('laisse remonter la dernière erreur quand aucun dossier ne marche', async () => {
    const { repo } = fakeRepo({}, () => new Error('disque plein'))
    await expect(runDailyBackup(repo, async () => [LIB, DOCS])).rejects.toThrow('disque plein')
  })

  it('sans application Windows, utilise le dossier retenu dans les réglages', async () => {
    const { repo, copies } = fakeRepo({ backup_dir: 'C:\\Sauve' })
    expect(await runDailyBackup(repo, null)).toBe(todayISO())
    expect(copies).toEqual([`C:\\Sauve\\${backupFileName(todayISO())}`])
  })

  it('sauvegarde une seule fois par jour', async () => {
    const { repo, copies } = fakeRepo({})
    expect(await runDailyBackup(repo, async () => [LIB])).toBe(todayISO())
    expect(await runDailyBackup(repo, async () => [LIB])).toBeNull()
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
