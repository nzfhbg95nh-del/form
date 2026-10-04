import { isSystemDatabase } from './database'
import type { ObjectRow } from './types'

export type WidgetType = 'recents' | 'favorites' | 'summary' | 'tasks' | 'note' | 'database' | 'calendar'

/** Un bloc de la page d'accueil. `dbId` : la base affichée par un widget « Base de données ». */
export interface Widget {
  id: string
  type: WidgetType
  dbId?: string
  /** Demi-largeur : deux widgets « demi » se placent côte à côte. */
  half?: boolean
}

export const WIDGET_TYPES: { type: WidgetType; label: string; help: string }[] = [
  { type: 'recents', label: 'Pages récentes', help: 'Les dernières pages modifiées' },
  { type: 'favorites', label: 'Favoris', help: 'Tes pages favorites' },
  { type: 'summary', label: 'Résumé de l’activité', help: 'Encaissé, à encaisser, devis en attente' },
  { type: 'calendar', label: 'Calendrier', help: 'Tâches, échéances de factures, devis et dates de tes bases' },
  { type: 'tasks', label: 'Tâches du jour', help: 'Les tâches à faire aujourd’hui ou en retard' },
  { type: 'note', label: 'Bloc-notes', help: 'Un petit texte libre' },
  { type: 'database', label: 'Base de données épinglée', help: 'Les premières lignes d’une de tes bases' },
]

export const DEFAULT_WIDGETS: Widget[] = [
  { id: 'recents', type: 'recents' },
  { id: 'favorites', type: 'favorites' },
  { id: 'summary', type: 'summary' },
  { id: 'tasks', type: 'tasks' },
]

const TYPES = new Set<string>(WIDGET_TYPES.map((t) => t.type))

/** Lit la liste enregistrée ; sans réglage (ou réglage abîmé), on prend la disposition par défaut. */
export function parseWidgets(raw: string | null | undefined): Widget[] {
  if (!raw) return DEFAULT_WIDGETS
  try {
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return DEFAULT_WIDGETS
    const seen = new Set<string>()
    const list: Widget[] = []
    for (const w of data) {
      if (!w || typeof w !== 'object' || typeof w.id !== 'string' || !TYPES.has(w.type) || seen.has(w.id)) continue
      seen.add(w.id)
      list.push({ id: w.id, type: w.type, ...(typeof w.dbId === 'string' ? { dbId: w.dbId } : {}), ...(w.half === true ? { half: true } : {}) })
    }
    return list
  } catch {
    return DEFAULT_WIDGETS
  }
}

export const serializeWidgets = (list: Widget[]) => JSON.stringify(list)

export function addWidget(list: Widget[], type: WidgetType, dbId?: string): Widget[] {
  const id = `${type}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  return [...list, { id, type, ...(dbId ? { dbId } : {}) }]
}

/** Passe un widget de pleine largeur à demi-largeur, et inversement. */
export const toggleHalf = (list: Widget[], id: string): Widget[] =>
  list.map((w) => {
    if (w.id !== id) return w
    const { half, ...rest } = w
    return half ? rest : { ...rest, half: true }
  })

export const removeWidget = (list: Widget[], id: string) => list.filter((w) => w.id !== id)

/** Monte (-1) ou descend (+1) un widget ; sans effet aux extrémités. */
export function moveWidget(list: Widget[], id: string, direction: -1 | 1): Widget[] {
  const i = list.findIndex((w) => w.id === id)
  const j = i + direction
  if (i < 0 || j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/** Déplace un widget juste avant ou juste après un autre (glisser-déposer). */
export function reorderWidget(list: Widget[], id: string, targetId: string, place: 'before' | 'after'): Widget[] {
  if (id === targetId) return list
  const moving = list.find((w) => w.id === id)
  if (!moving || !list.some((w) => w.id === targetId)) return list
  const rest = list.filter((w) => w.id !== id)
  const at = rest.findIndex((w) => w.id === targetId) + (place === 'after' ? 1 : 0)
  return [...rest.slice(0, at), moving, ...rest.slice(at)]
}

export const greeting = (hour: number) => (hour >= 18 || hour < 4 ? 'Bonsoir' : 'Bonjour')

const isPageLike = (o: ObjectRow) =>
  (o.type === 'page' || o.type === 'database' || o.type === 'moodboard') && !o.deleted_at && !isSystemDatabase(o)

export function recentPages(objects: ObjectRow[], count = 6): ObjectRow[] {
  return objects.filter(isPageLike).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, count)
}

export const favoritePages = (objects: ObjectRow[]): ObjectRow[] =>
  objects.filter((o) => isPageLike(o) && o.is_favorite).sort((a, b) => a.title.localeCompare(b.title, 'fr'))

/** Premières lignes d'une base (les plus récentes d'abord). */
export function databaseRows(objects: ObjectRow[], dbId: string, count = 8): ObjectRow[] {
  return objects
    .filter((o) => o.type === 'row' && o.parent_id === dbId && !o.deleted_at)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, count)
}
