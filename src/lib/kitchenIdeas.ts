// Idées de plats pour aujourd'hui (accueil cuisine) : de saison, sans viande, pas déjà prévus cette semaine,
// avec des protéines variées, et qui changent d'un jour à l'autre. Logique pure, testée automatiquement.

import { MEAT, mainProtein, twins, type CandidateRecipe } from './mealPrep'
import { recipeSeason, seasonScore } from './seasons'
import { fold } from './shoppingList'

export interface TodayIdea {
  id: string
  title: string
  reasons: string[]
  /** Les fruits et légumes de saison qu'elle utilise. */
  inSeason: string[]
}

/** Un petit nombre stable pour un texte : sert à faire tourner les idées chaque jour sans hasard. */
const hash = (t: string) => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296 }

/**
 * Les idées pour le jour `date`. `planned` : les recettes déjà prévues cette semaine (non reproposées).
 * Une recette qui demande deux produits frais hors saison ou plus est écartée ; une seule idée par protéine principale.
 */
export function todayIdeas(candidates: CandidateRecipe[], date: Date, planned: Set<string> = new Set(), count = 6): TodayIdea[] {
  const month = date.getMonth() + 1
  const dayKey = `${date.getFullYear()}-${month}-${date.getDate()}`
  const pool = candidates
    .filter((c) => c.lines.length >= 3 && (c.type === null || c.type === 'plats' || c.type === 'midi'))
    .filter((c) => !planned.has(c.id) && !MEAT.test(fold(c.lines.join(' '))))
    .map((c) => ({ c, season: recipeSeason(c.lines, month), protein: mainProtein(c.lines) }))
    .filter((x) => x.season.outOfSeason.length < 2)
    // La saison compte d'abord ; le reste tourne chaque jour.
    .map((x) => ({ ...x, score: seasonScore(x.season) + hash(x.c.id + dayKey) * 2.5 }))
    .sort((a, b) => b.score - a.score)
  const out: (TodayIdea & { c: CandidateRecipe })[] = []
  const proteins = new Set<string>()
  for (const x of pool) {
    if (x.protein && proteins.has(x.protein)) continue
    if (out.some((o) => twins(o.c, x.c))) continue
    if (x.protein) proteins.add(x.protein)
    const reasons: string[] = []
    if (x.season.inSeason.length > 0) reasons.push(`de saison : ${x.season.inSeason.slice(0, 3).join(', ')}`)
    if (x.protein) reasons.push(x.protein)
    out.push({ id: x.c.id, title: x.c.title, reasons, inSeason: x.season.inSeason, c: x.c })
    if (out.length >= count) break
  }
  return out.map(({ c: _c, ...i }) => i)
}

export interface MealSuggestion { id: string; reasons: string[]; warning: string | null }

/**
 * Les plats à proposer pour un repas du planning : de saison, sans viande, pas déjà prévus cette semaine,
 * une autre protéine que les autres repas du même jour, et de préférence des ingrédients déjà dans les courses de la semaine.
 * `week` : les recettes déjà prévues cette semaine ; `sameDay` : celles du même jour.
 */
export function mealSuggestions(candidates: CandidateRecipe[], date: Date, week: string[], sameDay: string[], count = 6): MealSuggestion[] {
  const month = date.getMonth() + 1
  const dayKey = `${date.getFullYear()}-${month}-${date.getDate()}`
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const dayProteins = new Set(sameDay.map((id) => byId.get(id)).filter(Boolean).map((c) => mainProtein(c!.lines)).filter(Boolean))
  // Les ingrédients (frais) déjà achetés pour la semaine : un plat qui les réutilise évite le gaspillage.
  const weekWords = new Map<string, string>()
  for (const id of week) for (const l of byId.get(id)?.lines ?? []) {
    const s = recipeSeason([l], month)
    for (const n of [...s.inSeason, ...s.outOfSeason]) weekWords.set(n, n)
  }
  const planned = new Set(week)
  const pool = candidates
    .filter((c) => c.lines.length >= 3 && (c.type === null || c.type === 'plats' || c.type === 'midi'))
    .filter((c) => !planned.has(c.id) && !MEAT.test(fold(c.lines.join(' '))))
    .map((c) => {
      const season = recipeSeason(c.lines, month)
      const protein = mainProtein(c.lines)
      const reuse = [...new Set([...season.inSeason, ...season.outOfSeason].filter((n) => weekWords.has(n)))]
      const clash = protein !== null && dayProteins.has(protein)
      const score = seasonScore(season) + Math.min(reuse.length, 2) * 0.8 - (clash ? 2 : 0) + hash(c.id + dayKey) * 1.5
      return { c, season, protein, reuse, clash, score }
    })
    .filter((x) => x.season.outOfSeason.length < 2)
    .sort((a, b) => b.score - a.score)
  const out: MealSuggestion[] = []
  const chosen: CandidateRecipe[] = []
  const proteins = new Set<string>()
  for (const x of pool) {
    if (x.protein && proteins.has(x.protein)) continue
    if (chosen.some((c) => twins(c, x.c))) continue
    if (x.protein) proteins.add(x.protein)
    chosen.push(x.c)
    const reasons: string[] = []
    if (x.season.inSeason.length > 0) reasons.push(`de saison : ${x.season.inSeason.slice(0, 3).join(', ')}`)
    if (x.reuse.length > 0) reasons.push(`réutilise : ${x.reuse.slice(0, 3).join(', ')} (déjà dans tes courses)`)
    if (x.protein && dayProteins.size > 0 && !x.clash) reasons.push(`change de protéine : ${x.protein}`)
    else if (x.protein) reasons.push(x.protein)
    out.push({ id: x.c.id, reasons, warning: x.clash ? `même protéine qu’un autre repas du jour (${x.protein})` : x.season.outOfSeason.length > 0 ? `hors saison : ${x.season.outOfSeason.join(', ')}` : null })
    if (out.length >= count) break
  }
  return out
}
