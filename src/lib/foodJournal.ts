// Suivi quotidien : ce que Victor a mangé, écrit librement ligne par ligne (« 1 café », « 1 càc de miel », « 1 portion de Chana masala »),
// et le total de la journée comparé aux repères journaliers. Logique pure, testée automatiquement.

import { NUTRIENT_KEYS, weighLine, type FoodIndex, type Totals } from './nutrition'
import { fold } from './shoppingList'
import { parseNumber } from './recipeScale'

export const FOOD_JOURNAL_SETTING = 'food_journal'

/** Le journal : un texte par jour (« 2026-11-23 »). */
export function parseJournal(raw: string | null | undefined): Record<string, string> {
  try {
    const d = raw ? JSON.parse(raw) : null
    if (!d || typeof d !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(d)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === 'string' && v.trim()) out[k] = v
    return out
  } catch {
    return {}
  }
}

export interface JournalRecipe {
  id: string
  title: string
  /** Nutriments d'une portion. */
  perServing: Totals
  /** Lignes d'ingrédients (facultatif : pour la saison). */
  lines?: string[]
}

export interface JournalLine {
  line: string
  kind: 'recipe' | 'food' | 'noqty' | 'unknown'
  /** Ce qui a été reconnu (titre de la recette ou nom Ciqual). */
  label: string | null
  grams: number | null
  portions?: number
}

const PORTION = /^(\S+)\s+(?:portions?|parts?|assiettes?|bols?)\s+(?:de |d['’]\s?|du )?(.+)$/i

/** Une recette de Victor citée dans la ligne : « 1 portion de Chana masala », « ½ part de dahl », ou simplement le titre de la recette. */
export function findRecipe(line: string, recipes: JournalRecipe[]): { recipe: JournalRecipe; portions: number } | null {
  const m = PORTION.exec(line.trim())
  const n = m ? parseNumber(m[1]) : null
  const name = fold(m && n ? m[2] : line).replace(/['’]/g, ' ').trim()
  if (name.length < 3) return null
  // Le titre complet, ou son début (« Chana masala » pour « Chana masala (pois chiches en sauce épicée) »).
  const hit = recipes.find((r) => fold(r.title) === name) ?? recipes.find((r) => { const t = fold(r.title).replace(/['’]/g, ' '); return t.startsWith(name) && name.length >= 5 })
  return hit ? { recipe: hit, portions: m && n ? n : 1 } : null
}

/** Le total d'une journée et le détail de chaque ligne. */
export function journalDay(text: string, index: FoodIndex, recipes: JournalRecipe[], manual?: Record<string, number | null>): { totals: Totals; lines: JournalLine[] } {
  const totals: Totals = {}
  const add = (values: Totals, factor: number) => {
    for (const k of NUTRIENT_KEYS) {
      const v = values[k]
      if (v !== undefined && v !== null) totals[k] = (totals[k] ?? 0) + v * factor
    }
  }
  const lines: JournalLine[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[-•*]\s*/, '').trim()
    if (!line || line === '...' || line === '…') continue
    const rec = findRecipe(line, recipes)
    if (rec) {
      add(rec.recipe.perServing, rec.portions)
      lines.push({ line, kind: 'recipe', label: rec.recipe.title, grams: null, portions: rec.portions })
      continue
    }
    const w = weighLine(line)
    const m = index.match(w.name || line, manual)
    if (!m.food) { lines.push({ line, kind: m.how === 'ignored' ? 'noqty' : 'unknown', label: null, grams: w.grams }); continue }
    if (w.grams === null) { lines.push({ line, kind: 'noqty', label: m.food.name, grams: null }); continue }
    const per100: Totals = {}
    for (const k of NUTRIENT_KEYS) { const v = m.food.per100[k]; if (v !== null && v !== undefined) per100[k] = v }
    add(per100, w.grams / 100)
    lines.push({ line, kind: 'food', label: m.food.name, grams: w.grams })
  }
  return { totals, lines }
}

/** Les jours autour d'une date (pour la bande de jours) : `before` jours avant, `after` après. */
export function dayStrip(center: Date, before = 9, after = 9): Date[] {
  return Array.from({ length: before + after + 1 }, (_, i) => new Date(center.getFullYear(), center.getMonth(), center.getDate() - before + i))
}

const pad = (n: number) => String(n).padStart(2, '0')
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
