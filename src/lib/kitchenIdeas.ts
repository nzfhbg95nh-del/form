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
