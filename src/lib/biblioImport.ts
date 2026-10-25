// Import de la bibliothèque de Klippr dans Form : copie, table par table, de la base de Klippr (lue seulement) vers celle de Form.
// Les tables ont exactement les mêmes colonnes (mêmes migrations). On peut relancer l'import : ce qui est déjà là est ignoré.

export interface Db {
  select<T>(sql: string, params?: unknown[]): Promise<T>
  execute(sql: string, params?: unknown[]): Promise<unknown>
}

/** Les tables à copier, dans l'ordre (un fichier après son bloc, une empreinte après son fichier…). Pas les moodboards ni les recettes : Form a les siens. */
export const COPY_TABLES = [
  'lib_blocks', 'lib_files', 'lib_collections', 'lib_block_collections', 'lib_tags', 'lib_block_tags', 'lib_types', 'lib_type_boards',
  'lib_block_types', 'lib_embeddings', 'lib_text_embeddings', 'lib_colors', 'lib_links', 'lib_forgotten', 'lib_map', 'lib_ocr',
] as const

/** Les réglages de Klippr qui suivent : dossier de Social Saver, types déjà créés, version du classement. */
export const COPY_SETTINGS = ['library_root', 'types_seeded', 'classify_version'] as const

/** SQLite limite le nombre de paramètres d'une requête : on insère par paquets. */
const MAX_PARAMS = 900
/** Lignes lues d'un coup (les empreintes d'IA sont lourdes). */
const PAGE = 400

/** « INSERT OR IGNORE » de `rows` lignes. Les noms viennent de listes fixes et de la base de Klippr, jamais d'une saisie. */
export function buildInsert(table: string, columns: readonly string[], rows: number): string {
  let n = 0
  const values = Array.from({ length: rows }, () => `(${columns.map(() => `$${++n}`).join(', ')})`).join(', ')
  return `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES ${values}`
}

/** Combien de lignes tiennent dans une requête. */
export const rowsPerInsert = (columns: number) => Math.max(1, Math.floor(MAX_PARAMS / columns))

export interface Progress {
  table: string
  done: number
  total: number
}

export interface TableReport {
  table: string
  source: number
  target: number
}

async function count(db: Db, table: string): Promise<number> {
  const [row] = await db.select<{ n: number }[]>(`SELECT COUNT(*) AS n FROM ${table}`)
  return row?.n ?? 0
}

/** Copie une table. Rend le nombre de lignes lues. */
async function copyTable(source: Db, target: Db, table: string, onProgress: (p: Progress) => void): Promise<number> {
  const total = await count(source, table)
  let done = 0
  onProgress({ table, done, total })
  while (done < total) {
    const rows = await source.select<Record<string, unknown>[]>(`SELECT * FROM ${table} ORDER BY rowid LIMIT ${PAGE} OFFSET ${done}`)
    if (rows.length === 0) break
    const columns = Object.keys(rows[0])
    const per = rowsPerInsert(columns.length)
    for (let i = 0; i < rows.length; i += per) {
      const chunk = rows.slice(i, i + per)
      await target.execute(buildInsert(table, columns, chunk.length), chunk.flatMap((r) => columns.map((c) => r[c] ?? null)))
    }
    done += rows.length
    onProgress({ table, done, total })
  }
  return total
}

/** Copie les réglages utiles, sans écraser ceux que Form a déjà. */
async function copySettings(source: Db, target: Db) {
  for (const key of COPY_SETTINGS) {
    const [row] = await source.select<{ value: string | null }[]>('SELECT value FROM settings WHERE key = $1', [key])
    if (row?.value != null) await target.execute('INSERT OR IGNORE INTO settings (key, value) VALUES ($1, $2)', [key, row.value])
  }
}

/** Copie toute la bibliothèque, puis compare le nombre de lignes de chaque table des deux côtés. */
export async function importLibrary(source: Db, target: Db, onProgress: (p: Progress) => void = () => undefined): Promise<TableReport[]> {
  for (const table of COPY_TABLES) await copyTable(source, target, table, onProgress)
  await copySettings(source, target)
  const report: TableReport[] = []
  for (const table of COPY_TABLES) report.push({ table, source: await count(source, table), target: await count(target, table) })
  return report
}

/** Vrai si la copie est complète : Form a au moins autant de lignes que Klippr dans chaque table. */
export const isComplete = (report: TableReport[]) => report.every((r) => r.target >= r.source)
