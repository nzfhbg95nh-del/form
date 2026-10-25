import Database from '@tauri-apps/plugin-sql'

let db: Promise<Database> | null = null

export const getDb = () => (db ??= Database.load('sqlite:form.db'))

/** SQLite limite le nombre de paramètres par requête : on insère par paquets. */
const MAX_PARAMS = 900

/**
 * Insère plusieurs lignes à la fois. Les noms de table et de colonnes viennent de listes fixes du code, jamais de saisies.
 * `suffix` : fin de la requête (ex. « ON CONFLICT(id) DO UPDATE SET … » ou « OR IGNORE » via `verb`).
 */
export async function multiInsert(
  table: string,
  columns: readonly string[],
  rows: unknown[][],
  options: { verb?: string; suffix?: string } = {},
  onChunk?: (done: number) => void,
) {
  if (rows.length === 0) return
  const d = await getDb()
  const perChunk = Math.max(1, Math.floor(MAX_PARAMS / columns.length))
  let done = 0
  for (let i = 0; i < rows.length; i += perChunk) {
    const chunk = rows.slice(i, i + perChunk)
    let n = 0
    const values = chunk.map((row) => `(${row.map(() => `$${++n}`).join(', ')})`).join(', ')
    const sql = `${options.verb ?? 'INSERT'} INTO ${table} (${columns.join(', ')}) VALUES ${values} ${options.suffix ?? ''}`
    await d.execute(sql, chunk.flat())
    done += chunk.length
    onChunk?.(done)
  }
}

/** Exécute une requête pour chaque paquet de valeurs (ex. `WHERE path_rel IN (…)`). */
export async function inChunks(values: string[], run: (marks: string, chunk: string[]) => Promise<unknown>) {
  for (let i = 0; i < values.length; i += MAX_PARAMS) {
    const chunk = values.slice(i, i + MAX_PARAMS)
    await run(chunk.map((_, j) => `$${j + 1}`).join(', '), chunk)
  }
}
