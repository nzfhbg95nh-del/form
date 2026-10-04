// Import d'un export Notion (« Markdown & CSV »). Cette partie ne fait que LIRE et ANALYSER les fichiers :
// elle construit un plan (pages, bases de données, lignes) sans rien écrire. Tout est testé automatiquement.

import { csvRecords } from './csv'
import { newId, OPTION_COLORS, type Column, type Schema } from './database'

export interface NotionFile {
  path: string
  data: Uint8Array
}

export type NodeKind = 'page' | 'database' | 'row'

export interface PlanNode {
  /** Identifiant Notion (32 caractères dans le nom du fichier) ou, à défaut, le chemin. Sert à ne pas importer deux fois. */
  key: string
  kind: NodeKind
  title: string
  parentKey: string | null
  /** Chemin du fichier Markdown de la page (s'il existe). */
  mdPath?: string
  /** Base de données : schéma déduit du CSV. */
  schema?: Schema
  /** Ligne : valeurs déjà converties (clés = identifiants de colonnes de la base). */
  values?: Record<string, unknown>
}

export interface Plan {
  nodes: PlanNode[]
  warnings: string[]
  stats: { pages: number; databases: number; rows: number; images: number }
}

// ───────────────────────── Chemins et noms ─────────────────────────

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').normalize('NFC')
}

const dirname = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1)
const stripExt = (p: string) => p.replace(/\.[^./]+$/, '')

export interface ParsedName {
  title: string
  id: string | null
  ext: string
  all: boolean
}

/** « Ma page 0123456789abcdef0123456789abcdef.md » -> titre « Ma page », identifiant, extension. */
export function parseName(fileName: string): ParsedName {
  const m = /^(.*?)(?:\s+([0-9a-f]{32}))?(_all)?(?:\.([A-Za-z0-9]+))?$/i.exec(fileName)
  return { title: (m?.[1] ?? fileName).trim(), id: m?.[2]?.toLowerCase() ?? null, ext: (m?.[4] ?? '').toLowerCase(), all: !!m?.[3] }
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'])
export const isImagePath = (p: string) => IMAGE_EXT.has(p.split('.').pop()?.toLowerCase() ?? '')

/** Retire le dossier commun à tous les fichiers (Notion en ajoute souvent un). */
export function stripCommonRoot(paths: string[]): string[] {
  if (paths.length === 0) return paths
  const first = paths[0].split('/')[0]
  const same = paths.every((p) => p.includes('/') && p.split('/')[0] === first)
  // On ne retire ce dossier que s'il n'est pas lui-même une page (aucun fichier « <dossier>.md » à côté).
  const hasOwner = paths.some((p) => !p.includes('/') && stripExt(p) === first)
  return same && !hasOwner ? paths.map((p) => p.slice(first.length + 1)) : paths
}

/** Chemin d'une image citée dans une page : relatif au dossier de la page, avec des %20, etc. */
export function resolveAsset(mdPath: string, href: string): string {
  let target = href.trim().replace(/^<|>$/g, '')
  try { target = decodeURIComponent(target) } catch { /* adresse déjà décodée */ }
  const parts = (target.startsWith('/') ? target.slice(1) : `${dirname(mdPath)}/${target}`).split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return normalizePath(out.join('/'))
}

// ───────────────────────── Dates, types, valeurs ─────────────────────────

const MONTHS: Record<string, number> = {
  january: 1, janvier: 1, jan: 1, janv: 1, february: 2, février: 2, fevrier: 2, feb: 2, févr: 2, fevr: 2, march: 3, mars: 3, mar: 3,
  april: 4, avril: 4, apr: 4, avr: 4, may: 5, mai: 5, june: 6, juin: 6, jun: 6, july: 7, juillet: 7, jul: 7, juil: 7,
  august: 8, août: 8, aout: 8, aug: 8, september: 9, septembre: 9, sep: 9, sept: 9, october: 10, octobre: 10, oct: 10,
  november: 11, novembre: 11, nov: 11, december: 12, décembre: 12, decembre: 12, dec: 12, déc: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')

function validIso(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null
}

/** Date écrite par Notion (français ou anglais, plage « → » : on garde le début) -> AAAA-MM-JJ, ou null. */
export function parseNotionDate(text: string): string | null {
  const s = text.split('→')[0].trim().toLowerCase()
  if (!s) return null
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return validIso(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s) // jj/mm/aaaa (réglage français)
  if (m) return validIso(+m[3], +m[2], +m[1])
  m = /^(\d{1,2})(?:er)?\s+([a-zéûèôîàç.]+)\s+(\d{4})/.exec(s) // 4 octobre 2026
  if (m && MONTHS[m[2].replace('.', '')]) return validIso(+m[3], MONTHS[m[2].replace('.', '')], +m[1])
  m = /^([a-zéûèôîàç.]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(s) // October 4, 2026
  if (m && MONTHS[m[1].replace('.', '')]) return validIso(+m[3], MONTHS[m[1].replace('.', '')], +m[2])
  return null
}

const TRUE_WORDS = new Set(['yes', 'oui', 'true', 'checked', 'coché', 'coche', '✓', '✔'])
const FALSE_WORDS = new Set(['no', 'non', 'false', 'unchecked', 'décoché', 'decoche'])

/** « Page liée (https://www.notion.so/…) » -> « Page liée ». */
export function cleanRelation(value: string): string {
  return value.replace(/\s*\(https?:\/\/(?:www\.)?notion\.so\/[^)]*\)/g, '').trim()
}

function parseNumber(value: string): number | null {
  const cleaned = value.replace(/[€$%\s ]/g, '').replace(',', '.')
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null
}

const isUrl = (v: string) => /^https?:\/\/\S+$/i.test(v.trim())

export interface InferredColumn {
  type: Column['type']
  options?: string[]
}

/** Devine le type d'une colonne d'après ses valeurs. */
export function inferColumn(rawValues: string[]): InferredColumn {
  const values = rawValues.map((v) => v.trim()).filter(Boolean)
  if (values.length === 0) return { type: 'text' }
  if (values.every((v) => TRUE_WORDS.has(v.toLowerCase()) || FALSE_WORDS.has(v.toLowerCase()))) return { type: 'checkbox' }
  if (values.every((v) => parseNumber(v) !== null)) return { type: 'number' }
  if (values.every((v) => parseNotionDate(v) !== null)) return { type: 'date' }
  if (values.every(isUrl)) return { type: 'url' }
  const multi = values.some((v) => v.includes(','))
  const items = multi ? values.flatMap((v) => v.split(',').map((x) => x.trim()).filter(Boolean)) : values
  const distinct = [...new Set(items)]
  if (distinct.length <= 12 && items.length > distinct.length && distinct.every((d) => d.length <= 40)) {
    return { type: multi ? 'multiselect' : 'select', options: distinct }
  }
  return { type: 'text' }
}

function convertValue(raw: string, col: Column): unknown {
  const v = raw.trim()
  if (v === '') return col.type === 'checkbox' ? false : null
  switch (col.type) {
    case 'checkbox': return TRUE_WORDS.has(v.toLowerCase())
    case 'number': return parseNumber(v)
    case 'date': return parseNotionDate(v)
    case 'url': return v
    case 'select': return col.options?.find((o) => o.label === v)?.id ?? null
    case 'multiselect': return v.split(',').map((x) => x.trim()).filter(Boolean).map((l) => col.options?.find((o) => o.label === l)?.id).filter(Boolean)
    default: return cleanRelation(v)
  }
}

/** Schéma de base de données d'après un CSV Notion. La première colonne est le titre de chaque ligne. */
export function schemaFromCsv(headers: string[], records: Record<string, string>[]): { schema: Schema; titleHeader: string; columnByHeader: Map<string, Column> } {
  const [titleHeader, ...others] = headers
  const columns: Column[] = []
  const columnByHeader = new Map<string, Column>()
  for (const header of others) {
    const inferred = inferColumn(records.map((r) => r[header] ?? ''))
    const col: Column = { id: newId(), name: header || 'Propriété', type: inferred.type }
    if (inferred.options) col.options = inferred.options.map((label, i) => ({ id: newId(), label, color: OPTION_COLORS[i % OPTION_COLORS.length] }))
    columns.push(col)
    columnByHeader.set(header, col)
  }
  const schema: Schema = { columns, views: [{ id: newId(), name: 'Tableau', type: 'table', filters: [], sorts: [] }] }
  return { schema, titleHeader, columnByHeader }
}

// ───────────────────────── Markdown : préparation avant l'éditeur ─────────────────────────

/**
 * Notion écrit en début de page d'une ligne de base de données ses propriétés (« Tags: A, B ») : elles sont déjà
 * dans le CSV, on les retire. Le titre (# …) est retiré aussi, il devient le titre de la page.
 */
export function stripPageHeader(markdown: string, isRow: boolean): string {
  const lines = markdown.replace(/^﻿/, '').split(/\r?\n/)
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++
  if (i < lines.length && /^#\s+/.test(lines[i])) i++
  while (i < lines.length && lines[i].trim() === '') i++
  if (isRow) {
    let j = i
    while (j < lines.length && /^[^:\n]{1,80}:(\s.*)?$/.test(lines[j]) && lines[j].trim() !== '') j++
    if (j > i) i = j
  }
  return lines.slice(i).join('\n').trim()
}

/** Remplace le HTML propre à Notion (encarts, toggles, colonnes) par du Markdown que l'éditeur sait lire. */
export function convertNotionHtml(markdown: string): string {
  return markdown
    .replace(/<aside>\s*([\s\S]*?)\s*<\/aside>/g, (_m, inner: string) => inner.split('\n').map((l) => `> ${l}`.trimEnd()).join('\n'))
    .replace(/<summary>([\s\S]*?)<\/summary>/g, '**$1**\n')
    .replace(/<\/?details[^>]*>/g, '')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/?(?:div|span|figure|figcaption|mark|u)[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
}

/** Adresses d'images d'une page (Markdown) : ![alt](chemin). Les adresses web (http) sont ignorées. */
export function imageRefs(markdown: string): string[] {
  const refs: string[] = []
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+(?:\s[^)]*)?)\)/g)) {
    const href = m[1].split(' ')[0]
    if (!/^(https?:|data:)/i.test(href)) refs.push(href)
  }
  return refs
}

// ───────────────────────── Le plan d'import ─────────────────────────

const decode = (d: Uint8Array) => new TextDecoder('utf-8').decode(d)

export function buildPlan(rawFiles: NotionFile[]): Plan {
  const warnings: string[] = []
  const normalized = rawFiles
    .map((f) => ({ ...f, path: normalizePath(f.path) }))
    .filter((f) => f.path && !f.path.endsWith('/') && !basename(f.path).startsWith('.') && !f.path.startsWith('__MACOSX/'))
  const stripped = stripCommonRoot(normalized.map((f) => f.path))
  const files = new Map<string, Uint8Array>(normalized.map((f, i) => [stripped[i], f.data]))

  const mdPaths = [...files.keys()].filter((p) => p.toLowerCase().endsWith('.md'))
  const csvPaths = [...files.keys()].filter((p) => p.toLowerCase().endsWith('.csv'))
  const images = [...files.keys()].filter(isImagePath)

  // Bases de données : « Nom <id>.csv » (on préfère la version « _all », qui a toutes les colonnes).
  const dbByBase = new Map<string, string>()
  for (const p of csvPaths) {
    const name = parseName(basename(p))
    const base = `${dirname(p)}/${name.title}${name.id ? ` ${name.id}` : ''}`.replace(/^\//, '')
    if (!dbByBase.has(base) || name.all) dbByBase.set(base, p)
  }
  const dbFolders = new Set(dbByBase.keys())

  // Propriétaire d'un dossier : la page (.md) ou la base (.csv) qui porte le même nom.
  const ownerOfFolder = new Map<string, { key: string; kind: NodeKind }>()
  const keyOf = (path: string, id: string | null) => id ?? path

  const nodes: PlanNode[] = []
  const nodeByKey = new Map<string, PlanNode>()
  const add = (n: PlanNode) => { nodes.push(n); nodeByKey.set(n.key, n) }

  // 1) Pages (hors lignes de bases)
  const rowMd = new Set<string>()
  for (const p of mdPaths) if (dbFolders.has(dirname(p))) rowMd.add(p)

  for (const p of mdPaths) {
    if (rowMd.has(p)) continue
    const name = parseName(basename(p))
    const key = keyOf(p, name.id)
    ownerOfFolder.set(stripExt(p), { key, kind: 'page' })
    add({ key, kind: 'page', title: name.title || 'Sans titre', parentKey: null, mdPath: p })
  }

  // 2) Bases de données
  const dbInfo = new Map<string, { node: PlanNode; titleHeader: string; columnByHeader: Map<string, Column>; records: Record<string, string>[]; folder: string }>()
  for (const [base, csvPath] of dbByBase) {
    const name = parseName(basename(csvPath))
    const { headers, records } = csvRecords(decode(files.get(csvPath)!))
    if (headers.length === 0) continue
    const { schema, titleHeader, columnByHeader } = schemaFromCsv(headers, records)
    const key = keyOf(csvPath, name.id)
    const node: PlanNode = { key, kind: 'database', title: name.title || 'Base de données', parentKey: null, schema }
    add(node)
    ownerOfFolder.set(base, { key, kind: 'database' })
    dbInfo.set(base, { node, titleHeader, columnByHeader, records, folder: base })
    if (headers.length > 12) warnings.push(`La base « ${node.title} » a ${headers.length} colonnes.`)
  }

  // 3) Lignes : une par ligne du CSV, reliée à sa page Markdown par le titre
  const norm = (t: string) => t.normalize('NFC').trim().toLowerCase()
  for (const info of dbInfo.values()) {
    const pagesInFolder = mdPaths.filter((p) => dirname(p) === info.folder)
    const unused = new Map(pagesInFolder.map((p) => [p, parseName(basename(p))]))
    const addRow = (title: string, record: Record<string, string> | null, mdPath: string | undefined, id: string | null, index: number) => {
      const values: Record<string, unknown> = {}
      if (record) for (const [header, col] of info.columnByHeader) values[col.id] = convertValue(record[header] ?? '', col)
      add({ key: id ?? `${info.node.key}:row:${index}`, kind: 'row', title: title || 'Sans titre', parentKey: info.node.key, mdPath, values })
    }
    info.records.forEach((record, i) => {
      const title = record[info.titleHeader] ?? ''
      let match: [string, ParsedName] | undefined
      for (const entry of unused) if (norm(entry[1].title) === norm(title)) { match = entry; break }
      if (match) unused.delete(match[0])
      addRow(title, record, match?.[0], match?.[1].id ?? null, i)
    })
    let extra = info.records.length
    for (const [p, name] of unused) addRow(name.title, null, p, name.id, extra++) // pages sans ligne dans le CSV
  }

  // 4) Parents : on remonte les dossiers jusqu'à trouver la page ou la base qui les contient
  const ancestor = (folder: string, from: PlanNode): string | null => {
    let dir = folder
    while (dir) {
      const owner = ownerOfFolder.get(dir)
      if (owner && owner.key !== from.key) {
        // Une page ne peut pas être « dans une ligne » : on remonte jusqu'à la page qui contient la base.
        if (nodeByKey.get(owner.key)?.kind === 'row') { dir = dirname(dir); continue }
        return owner.key
      }
      dir = dirname(dir)
    }
    return null
  }
  for (const node of nodes) {
    if (node.kind === 'row') continue
    const path = node.mdPath ?? [...dbByBase.entries()].find(([, p]) => keyOf(p, parseName(basename(p)).id) === node.key)?.[1] ?? ''
    // Dossier qui contient le fichier ; pour une page, son propre dossier est celui de ses sous-pages, pas le sien.
    node.parentKey = ancestor(dirname(path), node)
  }
  // Un dossier de ligne (sous-pages d'une ligne) a pour propriétaire la ligne : on ré-attache à la base mère.
  for (const node of nodes) if (node.kind === 'row' && node.mdPath) ownerOfFolder.set(stripExt(node.mdPath), { key: node.key, kind: 'row' })
  for (const node of nodes) {
    if (node.kind !== 'page' || !node.mdPath) continue
    const dir = dirname(node.mdPath)
    const parentRow = nodes.find((n) => n.kind === 'row' && n.mdPath && stripExt(n.mdPath) === dir)
    // Une page rangée dans une ligne de base va à côté de la base, dans la page qui la contient.
    if (parentRow) node.parentKey = nodeByKey.get(parentRow.parentKey ?? '')?.parentKey ?? null
  }

  const hasView = csvPaths.some((p) => /_all\.csv$/i.test(p))
  if (hasView) warnings.push('Les vues Notion (kanban, calendrier, galerie, filtres) ne sont pas importées : les bases arrivent en tableau, à reconfigurer.')
  if (nodes.some((n) => n.kind === 'database')) warnings.push('Les relations et les formules sont importées en simple texte.')
  warnings.push("Les icônes et les couvertures de pages ne sont pas incluses dans l'export de Notion.")

  return {
    nodes,
    warnings,
    stats: {
      pages: nodes.filter((n) => n.kind === 'page').length,
      databases: nodes.filter((n) => n.kind === 'database').length,
      rows: nodes.filter((n) => n.kind === 'row').length,
      images: images.length,
    },
  }
}

/** Tous les fichiers de l'export, avec leurs données (pour retrouver les images d'une page). */
export function indexFiles(rawFiles: NotionFile[]): Map<string, Uint8Array> {
  const normalized = rawFiles
    .map((f) => ({ ...f, path: normalizePath(f.path) }))
    .filter((f) => f.path && !f.path.endsWith('/') && !basename(f.path).startsWith('.') && !f.path.startsWith('__MACOSX/'))
  const stripped = stripCommonRoot(normalized.map((f) => f.path))
  return new Map(normalized.map((f, i) => [stripped[i], f.data]))
}
