import type { ObjectRow } from './types'

export type PropType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'url' | 'relation' | 'file'

export const PROP_TYPES: { type: PropType; label: string }[] = [
  { type: 'text', label: 'Texte' },
  { type: 'number', label: 'Nombre' },
  { type: 'date', label: 'Date' },
  { type: 'select', label: 'Choix unique' },
  { type: 'multiselect', label: 'Choix multiple' },
  { type: 'checkbox', label: 'Case à cocher' },
  { type: 'url', label: 'Lien (URL)' },
  { type: 'relation', label: 'Relation (lien vers une autre base)' },
  { type: 'file', label: 'Fichiers' },
]

export const OPTION_COLORS = ['#e3e2e0', '#fadec9', '#fdecc8', '#dbeddb', '#d3e5ef', '#e8deee', '#f5e0e9', '#ffe2dd']

export interface SelectOption {
  id: string
  label: string
  color: string
}

export interface Column {
  id: string
  name: string
  type: PropType
  options?: SelectOption[]
  /** Pour une relation : identifiant de la base de données ciblée. */
  targetDb?: string
}

export interface FileValue {
  name: string
  data: string
}

export type FilterOp =
  | 'contains' | 'not_contains' | 'is_empty' | 'not_empty'
  | 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte'
  | 'before' | 'after'
  | 'checked' | 'unchecked'
  | 'is' | 'is_not'

export interface Filter {
  id: string
  colId: string
  op: FilterOp
  value: string
}

export interface Sort {
  colId: string
  dir: 'asc' | 'desc'
}

export type ViewType = 'table' | 'list' | 'kanban' | 'calendar' | 'gallery'

export const VIEW_TYPES: { type: ViewType; label: string }[] = [
  { type: 'table', label: 'Tableau' },
  { type: 'list', label: 'Liste' },
  { type: 'kanban', label: 'Kanban' },
  { type: 'calendar', label: 'Calendrier' },
  { type: 'gallery', label: 'Galerie' },
]

export interface ViewConfig {
  id: string
  name: string
  type: ViewType
  filters: Filter[]
  sorts: Sort[]
  /** Propriété de regroupement (tableau, liste) ou de colonnes (kanban). */
  groupBy?: string
  /** Propriété date utilisée par le calendrier. */
  dateCol?: string
}

export function makeView(type: ViewType): ViewConfig {
  return { id: newId(), name: VIEW_TYPES.find((t) => t.type === type)!.label, type, filters: [], sorts: [] }
}

export interface Schema {
  columns: Column[]
  views: ViewConfig[]
  /** Base de tâches (kind = tasks) : surveillée par les rappels. */
  kind?: 'tasks' | 'mail' | 'agenda' | 'recipes'
}

/** La colonne « Nom » existe toujours : c'est le titre de chaque ligne. */
export const TITLE_COLUMN: Column = { id: 'title', name: 'Nom', type: 'text' }

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** Base « Agenda » : les événements ajoutés depuis le calendrier de l'accueil (un nom, une date, des notes). */
export function agendaSchema(): Schema {
  return {
    kind: 'agenda',
    columns: [{ id: 'date', name: 'Date', type: 'date' }, { id: 'time', name: 'Heure', type: 'text' }, { id: 'notes', name: 'Notes', type: 'text' }],
    views: [
      { id: newId(), name: 'Calendrier', type: 'calendar', filters: [], sorts: [], dateCol: 'date' },
      { id: newId(), name: 'Tableau', type: 'table', filters: [], sorts: [{ colId: 'date', dir: 'asc' }] },
    ],
  }
}

export function defaultSchema(): Schema {
  return {
    columns: [{ id: newId(), name: 'Date', type: 'date' }, { id: newId(), name: 'Notes', type: 'text' }],
    views: [{ id: newId(), name: 'Tableau', type: 'table', filters: [], sorts: [] }],
  }
}

export function parseSchema(properties: string): Schema {
  try {
    const data = JSON.parse(properties)
    if (Array.isArray(data.columns) && Array.isArray(data.views) && data.views.length > 0) return data as Schema
  } catch {
    /* schéma illisible : on repart d'un schéma par défaut */
  }
  return defaultSchema()
}

export function parseValues(properties: string): Record<string, unknown> {
  try {
    const data = JSON.parse(properties)
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch {
    return {}
  }
}

/** Bases « système » : le courrier, l'agenda du calendrier d'accueil et les recettes (chacune a sa propre entrée). Elles n'apparaissent pas dans les pages. */
export function isSystemDatabase(o: { type: string; properties: string }): boolean {
  if (o.type !== 'database') return false
  const kind = parseSchema(o.properties).kind
  return kind === 'mail' || kind === 'agenda' || kind === 'recipes'
}

export function allColumns(schema: Schema): Column[] {
  return [TITLE_COLUMN, ...schema.columns]
}

export function cellValue(row: ObjectRow, col: Column): unknown {
  return col.id === 'title' ? row.title : parseValues(row.properties)[col.id]
}

export function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '' || value === false || (Array.isArray(value) && value.length === 0)
}

export const OPS_BY_TYPE: Record<PropType, { op: FilterOp; label: string }[]> = {
  text: [
    { op: 'contains', label: 'contient' }, { op: 'not_contains', label: 'ne contient pas' },
    { op: 'is_empty', label: 'est vide' }, { op: 'not_empty', label: "n'est pas vide" },
  ],
  url: [
    { op: 'contains', label: 'contient' }, { op: 'not_contains', label: 'ne contient pas' },
    { op: 'is_empty', label: 'est vide' }, { op: 'not_empty', label: "n'est pas vide" },
  ],
  number: [
    { op: 'eq', label: '=' }, { op: 'neq', label: '≠' }, { op: 'gt', label: '>' }, { op: 'lt', label: '<' },
    { op: 'gte', label: '≥' }, { op: 'lte', label: '≤' },
    { op: 'is_empty', label: 'est vide' }, { op: 'not_empty', label: "n'est pas vide" },
  ],
  date: [
    { op: 'eq', label: 'est le' }, { op: 'before', label: 'avant le' }, { op: 'after', label: 'après le' },
    { op: 'is_empty', label: 'est vide' }, { op: 'not_empty', label: "n'est pas vide" },
  ],
  relation: [{ op: 'is_empty', label: 'est vide' }, { op: 'not_empty', label: "n'est pas vide" }],
  file: [{ op: 'is_empty', label: 'est vide' }, { op: 'not_empty', label: "n'est pas vide" }],
  checkbox: [{ op: 'checked', label: 'est coché' }, { op: 'unchecked', label: "n'est pas coché" }],
  select: [
    { op: 'is', label: 'est' }, { op: 'is_not', label: "n'est pas" },
    { op: 'is_empty', label: 'est vide' }, { op: 'not_empty', label: "n'est pas vide" },
  ],
  multiselect: [
    { op: 'contains', label: 'contient' }, { op: 'not_contains', label: 'ne contient pas' },
    { op: 'is_empty', label: 'est vide' }, { op: 'not_empty', label: "n'est pas vide" },
  ],
}

export function needsValue(op: FilterOp): boolean {
  return !['is_empty', 'not_empty', 'checked', 'unchecked'].includes(op)
}

export function matchesFilter(value: unknown, col: Column, f: Filter): boolean {
  switch (f.op) {
    case 'is_empty': return isEmpty(value)
    case 'not_empty': return !isEmpty(value)
    case 'checked': return value === true
    case 'unchecked': return value !== true
  }
  if (col.type === 'number') {
    if (isEmpty(value) || f.value === '') return false
    const a = Number(value), b = Number(f.value)
    return { eq: a === b, neq: a !== b, gt: a > b, lt: a < b, gte: a >= b, lte: a <= b }[f.op as 'eq'] ?? false
  }
  if (col.type === 'date') {
    if (isEmpty(value) || f.value === '') return false
    const a = String(value), b = f.value // dates ISO AAAA-MM-JJ : l'ordre alphabétique est l'ordre chronologique
    return f.op === 'eq' ? a === b : f.op === 'before' ? a < b : f.op === 'after' ? a > b : false
  }
  if (col.type === 'select') {
    return f.op === 'is' ? value === f.value : f.op === 'is_not' ? value !== f.value : false
  }
  if (col.type === 'multiselect') {
    const has = Array.isArray(value) && value.includes(f.value)
    return f.op === 'contains' ? has : f.op === 'not_contains' ? !has : false
  }
  // texte et URL : sans tenir compte des majuscules ni des accents
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const has = norm(String(value ?? '')).includes(norm(f.value))
  return f.op === 'contains' ? has : f.op === 'not_contains' ? !has : false
}

function compare(a: unknown, b: unknown, col: Column): number {
  // Les valeurs vides vont toujours à la fin.
  const ea = isEmpty(a), eb = isEmpty(b)
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1
  if (col.type === 'number') return Number(a) - Number(b)
  if (col.type === 'checkbox') return Number(a === true) - Number(b === true)
  if (col.type === 'select') {
    const label = (v: unknown) => col.options?.find((o) => o.id === v)?.label ?? ''
    return label(a).localeCompare(label(b), 'fr')
  }
  if (col.type === 'multiselect' || col.type === 'relation' || col.type === 'file') return (a as unknown[]).length - (b as unknown[]).length
  return String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' })
}

/** Applique les filtres puis les tris d'une vue. Les filtres sont cumulés (ET). */
export function applyView(rows: ObjectRow[], schema: Schema, view: ViewConfig): ObjectRow[] {
  const cols = allColumns(schema)
  const byId = new Map(cols.map((c) => [c.id, c]))
  let result = rows.filter((row) =>
    view.filters.every((f) => {
      const col = byId.get(f.colId)
      return !col || matchesFilter(cellValue(row, col), col, f) // filtre sur une colonne supprimée : ignoré
    }),
  )
  const sorts = view.sorts.filter((s) => byId.has(s.colId))
  if (sorts.length > 0) {
    result = [...result].sort((ra, rb) => {
      for (const s of sorts) {
        const col = byId.get(s.colId)!
        const aEmpty = isEmpty(cellValue(ra, col)), bEmpty = isEmpty(cellValue(rb, col))
        const c = compare(cellValue(ra, col), cellValue(rb, col), col)
        if (c !== 0) return aEmpty || bEmpty ? c : s.dir === 'asc' ? c : -c
      }
      return ra.position - rb.position
    })
  }
  return result
}

export interface Group {
  id: string
  label: string
  color?: string
  /** Valeur à écrire dans une ligne pour la placer dans ce groupe (null = « sans valeur »). */
  value: unknown
  rows: ObjectRow[]
}

export function canGroupBy(col: Column): boolean {
  return col.type === 'select' || col.type === 'multiselect' || col.type === 'checkbox'
}

/** Répartit les lignes en groupes selon une propriété. Les lignes sans valeur vont dans « Sans valeur ». */
export function groupRows(rows: ObjectRow[], col: Column): Group[] {
  const empty: Group = { id: '__none', label: 'Sans valeur', value: null, rows: [] }
  if (col.type === 'checkbox') {
    const yes: Group = { id: 'yes', label: 'Coché', value: true, rows: [] }
    const no: Group = { id: 'no', label: 'Non coché', value: false, rows: [] }
    for (const r of rows) (cellValue(r, col) === true ? yes : no).rows.push(r)
    return [yes, no]
  }
  const groups: Group[] = (col.options ?? []).map((o) => ({
    id: o.id, label: o.label, color: o.color, value: col.type === 'multiselect' ? [o.id] : o.id, rows: [],
  }))
  for (const r of rows) {
    const v = cellValue(r, col)
    const ids = Array.isArray(v) ? (v as string[]) : v ? [v as string] : []
    const targets = groups.filter((g) => ids.includes(g.id))
    if (targets.length === 0) empty.rows.push(r)
    for (const g of targets) g.rows.push(r)
  }
  return [...groups, empty]
}

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Grille d'un mois : semaines de 7 jours, du lundi au dimanche, avec les jours des mois voisins. */
export function monthGrid(year: number, month: number): { date: string; inMonth: boolean }[][] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7 // lundi = 0
  const start = new Date(year, month, 1 - offset)
  const weeks: { date: string; inMonth: boolean }[][] = []
  for (let w = 0; w < 6; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d)
      week.push({ date: isoDate(day), inMonth: day.getMonth() === month })
    }
    if (w >= 4 && !week.some((x) => x.inMonth)) break // pas de semaine entièrement vide à la fin
    weeks.push(week)
  }
  return weeks
}
