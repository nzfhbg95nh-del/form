/** Lit un fichier CSV (guillemets, virgules et retours à la ligne dans les cellules, séparateur , ou ;). Renvoie des lignes de cellules. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '')
  // Séparateur : celui qui apparaît le plus dans la première ligne (hors guillemets).
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  let commas = 0
  let semis = 0
  let quoted = false
  for (const c of firstLine) {
    if (c === '"') quoted = !quoted
    else if (!quoted && c === ',') commas++
    else if (!quoted && c === ';') semis++
  }
  const sep = semis > commas ? ';' : ','

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ }
        else inQuotes = false
      } else cell += c
    } else if (c === '"') inQuotes = true
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
    } else cell += c
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

/** Première ligne = en-têtes ; les lignes suivantes deviennent des objets { en-tête: valeur }. */
export function csvRecords(input: string): { headers: string[]; records: Record<string, string>[] } {
  const rows = parseCsv(input)
  if (rows.length === 0) return { headers: [], records: [] }
  const headers = rows[0].map((h) => h.trim())
  const records = rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])))
  return { headers, records }
}
