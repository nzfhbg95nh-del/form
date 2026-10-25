import { describe, expect, it } from 'vitest'
import { buildInsert, COPY_TABLES, importLibrary, isComplete, rowsPerInsert, type Db } from './biblioImport'

/** Une « base » en mémoire : une liste de lignes par table, et des réglages. Comprend juste les requêtes de l'import. */
function fakeDb(tables: Record<string, Record<string, unknown>[]>, settings: Record<string, string> = {}, keyOf: (t: string) => string = () => 'id'): Db & { inserts: number } {
  const db = {
    inserts: 0,
    async select<T>(sql: string, params: unknown[] = []): Promise<T> {
      const count = /SELECT COUNT\(\*\) AS n FROM (\w+)/.exec(sql)
      if (count) return [{ n: (tables[count[1]] ?? []).length }] as T
      const page = /FROM (\w+) ORDER BY rowid LIMIT (\d+) OFFSET (\d+)/.exec(sql)
      if (page) return (tables[page[1]] ?? []).slice(Number(page[3]), Number(page[3]) + Number(page[2])) as T
      if (sql.startsWith('SELECT value FROM settings')) return (params[0] as string in settings ? [{ value: settings[params[0] as string] }] : []) as T
      throw new Error('requête inconnue : ' + sql)
    },
    async execute(sql: string, params: unknown[] = []) {
      db.inserts++
      const settingsInsert = sql.startsWith('INSERT OR IGNORE INTO settings')
      if (settingsInsert) {
        if (!(params[0] as string in settings)) settings[params[0] as string] = params[1] as string
        return
      }
      const m = /INSERT OR IGNORE INTO (\w+) \(([^)]*)\)/.exec(sql)!
      const columns = m[2].split(', ')
      const rows = tables[m[1]] ?? (tables[m[1]] = [])
      for (let i = 0; i < params.length; i += columns.length) {
        const row = Object.fromEntries(columns.map((c, k) => [c, params[i + k]]))
        const key = keyOf(m[1])
        if (!rows.some((r) => r[key] === row[key])) rows.push(row)
      }
    },
  }
  return db
}

describe('buildInsert', () => {
  it('numérote les paramètres ligne après ligne', () => {
    expect(buildInsert('lib_x', ['a', 'b'], 2)).toBe('INSERT OR IGNORE INTO lib_x (a, b) VALUES ($1, $2), ($3, $4)')
  })
  it('garde chaque requête sous la limite de paramètres de SQLite', () => {
    expect(rowsPerInsert(8) * 8).toBeLessThanOrEqual(900)
    expect(rowsPerInsert(1000)).toBe(1)
  })
})

describe('importLibrary', () => {
  const source = () => ({
    lib_blocks: Array.from({ length: 1000 }, (_, i) => ({ id: `b${i}`, owner: 'x' })),
    lib_files: Array.from({ length: 450 }, (_, i) => ({ id: `f${i}`, block_id: `b${i}` })),
  })

  it('copie toutes les lignes, y compris au-delà d\'une page, et le rapport est complet', async () => {
    const target = fakeDb({})
    const report = await importLibrary(fakeDb(source()), target)
    expect(report.find((r) => r.table === 'lib_blocks')).toEqual({ table: 'lib_blocks', source: 1000, target: 1000 })
    expect(report.find((r) => r.table === 'lib_files')).toEqual({ table: 'lib_files', source: 450, target: 450 })
    expect(isComplete(report)).toBe(true)
    expect(report.map((r) => r.table)).toEqual([...COPY_TABLES])
  })

  it('peut être relancé : aucun doublon', async () => {
    const target = fakeDb({})
    await importLibrary(fakeDb(source()), target)
    const again = await importLibrary(fakeDb(source()), target)
    expect(again.find((r) => r.table === 'lib_blocks')!.target).toBe(1000)
  })

  it("reprend les réglages utiles mais n'écrase pas ceux de Form", async () => {
    const settings: Record<string, string> = { library_root: 'C:\\autre' }
    await importLibrary(fakeDb(source(), { library_root: 'C:\\Social Saver', classify_version: '3', inutile: 'x' }), fakeDb({}, settings))
    expect(settings).toEqual({ library_root: 'C:\\autre', classify_version: '3' })
  })

  it('annonce l\'avancement de chaque table', async () => {
    const seen: string[] = []
    await importLibrary(fakeDb(source()), fakeDb({}), (p) => { if (p.table === 'lib_files' && p.done === p.total) seen.push(`${p.done}/${p.total}`) })
    expect(seen).toEqual(['450/450'])
  })

  it('détecte une copie incomplète', () => {
    expect(isComplete([{ table: 'lib_blocks', source: 10, target: 9 }])).toBe(false)
  })
})
