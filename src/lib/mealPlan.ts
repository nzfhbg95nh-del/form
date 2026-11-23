// Planning des repas de la semaine : quelle recette, quel jour, midi ou soir, pour combien de personnes.
// Enregistré dans les réglages (clé MEAL_PLAN_SETTING) sous forme de JSON. Logique pure, testée automatiquement.

export const MEAL_PLAN_SETTING = 'meal_plan'

export type Meal = 'midi' | 'soir'
export const MEALS: { id: Meal; label: string }[] = [
  { id: 'midi', label: 'Midi' },
  { id: 'soir', label: 'Soir' },
]
export const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

export interface PlanEntry {
  id: string
  recipeId: string
  /** 0 = lundi … 6 = dimanche. */
  day: number
  meal: Meal
  servings: number
}

export interface MealPlan {
  version: 1
  /** Une semaine par lundi (« 2026-11-23 »). */
  weeks: Record<string, PlanEntry[]>
}

export const emptyPlan = (): MealPlan => ({ version: 1, weeks: {} })

const pad = (n: number) => String(n).padStart(2, '0')
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dateOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** La semaine (son lundi, à l'heure locale) qui contient cette date. */
export function weekKey(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const offset = (d.getDay() + 6) % 7 // lundi = 0
  d.setDate(d.getDate() - offset)
  return keyOf(d)
}

/** La semaine `n` semaines avant (n < 0) ou après (n > 0). */
export function shiftWeek(key: string, n: number): string {
  const d = dateOf(key)
  d.setDate(d.getDate() + 7 * n)
  return keyOf(d)
}

/** Les 7 dates de la semaine, du lundi au dimanche. */
export function weekDays(key: string): Date[] {
  const start = dateOf(key)
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** « Semaine du 23 au 29 novembre », ou « du 30 novembre au 6 décembre » quand elle change de mois (et d'année). */
export function weekLabel(key: string): string {
  const days = weekDays(key)
  const a = days[0]
  const b = days[6]
  if (a.getFullYear() !== b.getFullYear()) return `Semaine du ${a.getDate()} ${MONTHS[a.getMonth()]} ${a.getFullYear()} au ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`
  if (a.getMonth() !== b.getMonth()) return `Semaine du ${a.getDate()} ${MONTHS[a.getMonth()]} au ${b.getDate()} ${MONTHS[b.getMonth()]}`
  return `Semaine du ${a.getDate()} au ${b.getDate()} ${MONTHS[b.getMonth()]}`
}

const isMeal = (m: unknown): m is Meal => m === 'midi' || m === 'soir'
export const clampServings = (n: number) => Math.min(20, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)))

/** Lit le planning enregistré ; une valeur absente ou abîmée donne un planning vide (les lignes abîmées sont ignorées). */
export function parsePlan(raw: string | null | undefined): MealPlan {
  try {
    const data = raw ? JSON.parse(raw) : null
    if (!data || typeof data !== 'object' || typeof data.weeks !== 'object' || data.weeks === null) return emptyPlan()
    const weeks: Record<string, PlanEntry[]> = {}
    for (const [key, list] of Object.entries(data.weeks as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Array.isArray(list)) continue
      const clean = list
        .filter((e): e is PlanEntry => !!e && typeof e === 'object' && typeof e.id === 'string' && typeof e.recipeId === 'string' && Number.isInteger(e.day) && e.day >= 0 && e.day <= 6 && isMeal(e.meal))
        .map((e) => ({ id: e.id, recipeId: e.recipeId, day: e.day, meal: e.meal, servings: clampServings(e.servings) }))
      if (clean.length > 0) weeks[key] = clean
    }
    return { version: 1, weeks }
  } catch {
    return emptyPlan()
  }
}

export const serializePlan = (plan: MealPlan) => JSON.stringify(plan)

/** Les repas d'une case (jour + midi/soir), dans leur ordre. */
export function entriesAt(plan: MealPlan, week: string, day: number, meal: Meal): PlanEntry[] {
  return (plan.weeks[week] ?? []).filter((e) => e.day === day && e.meal === meal)
}

const withWeek = (plan: MealPlan, week: string, list: PlanEntry[]): MealPlan => {
  const weeks = { ...plan.weeks }
  if (list.length > 0) weeks[week] = list
  else delete weeks[week]
  return { ...plan, weeks }
}

/** Ajoute une recette dans une case (à la fin de la case). */
export function addEntry(plan: MealPlan, week: string, day: number, meal: Meal, recipeId: string, servings: number, id: string): MealPlan {
  return withWeek(plan, week, [...(plan.weeks[week] ?? []), { id, recipeId, day, meal, servings: clampServings(servings) }])
}

export function removeEntry(plan: MealPlan, week: string, id: string): MealPlan {
  return withWeek(plan, week, (plan.weeks[week] ?? []).filter((e) => e.id !== id))
}

export function setServings(plan: MealPlan, week: string, id: string, servings: number): MealPlan {
  return withWeek(plan, week, (plan.weeks[week] ?? []).map((e) => (e.id === id ? { ...e, servings: clampServings(servings) } : e)))
}

/**
 * Déplace un repas vers une autre case (ou dans la même), avant le repas `beforeId` de cette case, ou à la fin.
 * Rien ne change si le repas n'existe pas.
 */
export function moveEntry(plan: MealPlan, week: string, id: string, day: number, meal: Meal, beforeId: string | null = null): MealPlan {
  const list = plan.weeks[week] ?? []
  const moving = list.find((e) => e.id === id)
  if (!moving || id === beforeId) return plan
  const rest = list.filter((e) => e.id !== id)
  const moved = { ...moving, day, meal }
  const at = beforeId ? rest.findIndex((e) => e.id === beforeId) : -1
  if (at >= 0) rest.splice(at, 0, moved)
  else {
    // À la fin de la case visée : après son dernier repas (l'ordre des autres cases ne compte pas).
    let last = -1
    rest.forEach((e, i) => { if (e.day === day && e.meal === meal) last = i })
    rest.splice(last + 1 > 0 ? last + 1 : rest.length, 0, moved)
  }
  return withWeek(plan, week, rest)
}

/** Remplace la semaine `to` par une copie de la semaine `from` (nouveaux identifiants). */
export function copyWeek(plan: MealPlan, from: string, to: string, newId: () => string): MealPlan {
  return withWeek(plan, to, (plan.weeks[from] ?? []).map((e) => ({ ...e, id: newId() })))
}

/** Vide une semaine. */
export const clearWeek = (plan: MealPlan, week: string): MealPlan => withWeek(plan, week, [])

/** Les repas de la semaine dont la recette n'existe plus (supprimée) sont retirés. */
export function dropMissingRecipes(plan: MealPlan, exists: (recipeId: string) => boolean): MealPlan {
  let changed = false
  const weeks: Record<string, PlanEntry[]> = {}
  for (const [k, list] of Object.entries(plan.weeks)) {
    const kept = list.filter((e) => exists(e.recipeId))
    if (kept.length !== list.length) changed = true
    if (kept.length > 0) weeks[k] = kept
  }
  return changed ? { ...plan, weeks } : plan
}

/** Nombre de repas planifiés et de portions dans la semaine. */
export function weekStats(plan: MealPlan, week: string): { meals: number; servings: number; recipes: number } {
  const list = plan.weeks[week] ?? []
  return { meals: list.length, servings: list.reduce((s, e) => s + e.servings, 0), recipes: new Set(list.map((e) => e.recipeId)).size }
}
