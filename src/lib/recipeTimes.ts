/**
 * Estimation du temps de préparation d'une recette (propriété « Préparation (min) »).
 * 1. D'après la ligne « Temps : … » des notes (importée de Form) : on garde le temps actif (« 15 min + 35 min de cuisson » -> 15),
 *    pas la cuisson, le repos ni le mijotage.
 * 2. Sinon, une estimation d'après le nombre d'ingrédients et d'étapes : 5 min + 1,5 min par ingrédient + 2 min par étape, à 5 min près.
 * Rien n'est enregistré ici : l'écran montre l'estimation et Victor valide.
 */
import { parseContent } from './content'
import { parseValues } from './database'
import { displayTitle } from './lastEdit'
import { RECIPE } from './recipes'
import type { ObjectRow } from './types'

export type TimeSource = 'notes' | 'estimation'

export interface PrepEstimate {
  minutes: number
  source: TimeSource
}

const PASSIVE = /cuisson|cuire|mijot|repos|frais|four\b|marin|pousse|lever|refroid|congel|friture|frire|air fryer|reposer|infus|trempage|tremper|fumage|rotir|gratin/i

const normalized = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const textOf = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return (content as { text?: string }[]).map((c) => c.text ?? '').join('')
}

/** « 1 h 30 » -> 90, « 20 à 30 min » -> 25, « 2 h » -> 120. */
const DURATION = /(\d+(?:[.,]\d+)?)(?:\s*(?:à|-|–)\s*(\d+(?:[.,]\d+)?))?\s*(h(?:eures?)?|min(?:utes?)?)(?![a-zà-ÿ])\.?(?:\s*(\d{1,2})(?!\s*(?:h|min)))?/gi

/** Temps actif (hors cuisson, repos, mijotage…) d'un texte comme « 15 min + 35 min de cuisson ». Vide si aucun. */
export function activeMinutes(text: string): number | null {
  const found: { minutes: number; label: string }[] = []
  const matches = [...text.matchAll(DURATION)]
  matches.forEach((m, i) => {
    const num = (s: string) => Number(s.replace(',', '.'))
    const from = num(m[1])
    const value = m[2] ? (from + num(m[2])) / 2 : from
    const isHours = /^h/i.test(m[3])
    const minutes = isHours ? value * 60 + (m[4] ? Number(m[4]) : 0) : value
    const end = (m.index ?? 0) + m[0].length
    const next = matches[i + 1]?.index ?? text.length
    // Ce qui qualifie cette durée : le texte qui la suit jusqu'à la suivante (ou « + »).
    const label = text.slice(end, next).split('+')[0]
    found.push({ minutes, label })
  })
  const active = found.filter((f) => !PASSIVE.test(f.label) && f.minutes > 0)
  if (active.length === 0) return null
  const total = active.reduce((sum, f) => sum + f.minutes, 0)
  return Math.max(5, Math.round(total / 5) * 5)
}

interface BlockLike {
  type?: string
  content?: unknown
  children?: BlockLike[]
}

/** Compte les ingrédients et les étapes, et retrouve le texte « Temps : … » des notes. */
export function readRecipe(blocks: unknown[]): { ingredients: number; steps: number; time: string | null } {
  let section: 'ingredients' | 'steps' | 'other' = 'other'
  let ingredients = 0
  let steps = 0
  let time: string | null = null
  const walk = (list: BlockLike[]) => {
    for (const b of list) {
      const text = textOf(b.content)
      if (b.type === 'heading') {
        const t = normalized(text)
        section = t.startsWith('ingredient') ? 'ingredients' : t.startsWith('etape') || t.startsWith('preparation') || t.startsWith('instruction') ? 'steps' : 'other'
      } else if (text.trim() !== '') {
        if (['checkListItem', 'bulletListItem', 'numberedListItem', 'paragraph'].includes(b.type ?? '')) {
          if (section === 'ingredients' && b.type !== 'paragraph') ingredients++
          else if (section === 'steps' && ['numberedListItem', 'bulletListItem', 'paragraph'].includes(b.type ?? '')) steps++
        }
        const m = /Temps\s*:\s*(.+?)(?:\.\s|\.$|$)/.exec(text)
        if (m && time === null) time = m[1]
      }
      if (b.children?.length) walk(b.children)
    }
  }
  walk(blocks as BlockLike[])
  return { ingredients, steps, time }
}

/** 5 min + 1,5 min par ingrédient + 2 min par étape, à 5 min près, entre 5 et 90 min. */
export function estimateFromCounts(ingredients: number, steps: number): number | null {
  if (ingredients === 0 && steps === 0) return null
  const raw = 5 + 1.5 * ingredients + 2 * steps
  return Math.min(90, Math.max(5, Math.round(raw / 5) * 5))
}

/** Estimation pour le contenu enregistré d'une recette, ou null s'il n'y a rien pour estimer. */
export function estimatePrep(content: string | null): PrepEstimate | null {
  const blocks = parseContent(content)
  if (!blocks) return null
  const { ingredients, steps, time } = readRecipe(blocks)
  const fromNotes = time ? activeMinutes(time) : null
  if (fromNotes !== null) return { minutes: fromNotes, source: 'notes' }
  const minutes = estimateFromCounts(ingredients, steps)
  return minutes === null ? null : { minutes, source: 'estimation' }
}

/** Les recettes d'une base dont la préparation est vide, avec leur estimation (sert aussi à compter pour le bouton). */
export function recipesWithoutTime(rows: ObjectRow[]) {
  return missingTimes(rows.map((r) => ({ id: r.id, title: displayTitle(r.title), content: r.content, prep: parseValues(r.properties)[RECIPE.prep] })))
}

export interface MissingTime {
  id: string
  title: string
  minutes: number
  source: TimeSource
}

/** Les recettes sans temps de préparation (vide ou 0), avec leur estimation ; celles qu'on ne peut pas estimer sont comptées à part. Ne touche jamais un temps déjà rempli. */
export function missingTimes(rows: { id: string; title: string; content: string | null; prep: unknown }[]): { items: MissingTime[]; unknown: number } {
  const items: MissingTime[] = []
  let unknown = 0
  for (const r of rows) {
    const current = Number(r.prep)
    if (r.prep !== undefined && r.prep !== null && r.prep !== '' && Number.isFinite(current) && current > 0) continue
    const e = estimatePrep(r.content)
    if (e) items.push({ id: r.id, title: r.title, minutes: e.minutes, source: e.source })
    else unknown++
  }
  return { items, unknown }
}
