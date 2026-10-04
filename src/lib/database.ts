import type { ObjectRow } from './types'

export type PropType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'url'

export const PROP_TYPES: { type: PropType; label: string }[] = [
  { type: 'text', label: 'Texte' },
  { type: 'number', label: 'Nombre' },
  { type: 'date', label: 'Date' },
  { type: 'select', label: 'Choix unique' },
  { type: 'multiselect', label: 'Choix multiple' },
  { type: 'checkbox', label: 'Case à cocher' },
  { type: 'url', label: 'Lien (URL)' },
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

export interface ViewConfig {
  id: string
  name: string
  type: 'table'
  filters: Filter[]
  sorts: Sort[]
}

export interface Schema {
  columns: Column[]
  views: ViewConfig[]
}

/** La colonne « Nom » existe toujours : c'est le titre de chaque ligne. */
export const TITLE_COLUMN: Column = { id: 'title', name: 'Nom', type: 'text' }

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
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
  if (col.type === 'multiselect') return String((a as string[]).length).localeCompare(String((b as string[]).length))
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
