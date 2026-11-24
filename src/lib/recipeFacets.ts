// Ce qui sert à trier et filtrer les recettes : cuisine du monde, envies, temps, saison, ingrédients.
// La cuisine et les envies sont devinées d'après le titre et les ingrédients ; Victor peut les corriger
// dans les propriétés « Cuisine » et « Envies » de la recette (une valeur choisie à la main l'emporte toujours).
// Logique pure, testée automatiquement.

import { fold } from './shoppingList'

export interface Facet { id: string; label: string; color: string; emoji: string }

export const CUISINES: Facet[] = [
  { id: 'indienne', label: 'Indienne', color: '#fadec9', emoji: '🇮🇳' },
  { id: 'moyen-orient', label: 'Moyen-Orient', color: '#fdecc8', emoji: '🧆' },
  { id: 'maghreb', label: 'Maghreb', color: '#ffe2dd', emoji: '🫖' },
  { id: 'mediterraneenne', label: 'Méditerranéenne', color: '#dbeddb', emoji: '🫒' },
  { id: 'italienne', label: 'Italienne', color: '#d3e5ef', emoji: '🍝' },
  { id: 'asiatique', label: 'Asiatique', color: '#e8deee', emoji: '🥢' },
  { id: 'mexicaine', label: 'Mexicaine', color: '#f5e0e9', emoji: '🌮' },
  { id: 'francaise', label: 'Française', color: '#e3e2e0', emoji: '🥖' },
]

export const MOODS: Facet[] = [
  { id: 'reconfortant', label: 'Réconfortant', color: '#fadec9', emoji: '🫕' },
  { id: 'leger', label: 'Léger', color: '#dbeddb', emoji: '🥗' },
  { id: 'epice', label: 'Épicé', color: '#ffe2dd', emoji: '🌶️' },
]

// Dans l'ordre : la première cuisine qui a le plus d'indices l'emporte.
const CUISINE_HINTS: [string, RegExp][] = [
  ['indienne', /masala|curry(?! japonais)|dahl|\bdal\b|paneer|tikka|naan|chana|aloo|biryani|korma|chutney|tandoori|samosa|pakora|raita|curcuma|cardamome|ghee|bombay|chole|matar/],
  ['moyen-orient', /houmous|hummus|falafel|taboule|zaatar|za atar|tahini|tahin|baba ganoush|fattoush|labneh|shawarma|sumac|mouhammara|arayes|pita|kefta|libanais|palestinien|syrien|halloumi|acuka|ajvar|turque/],
  ['maghreb', /tajine|couscous|harissa|ras el hanout|chermoula|shakshuka|chakchouka|merguez|baghrir|msemen|marocain|tunisien|algerien/],
  ['italienne', /pates|spaghetti|penne|tagliatelle|linguine|risotto|parmesan|pesto|lasagne|gnocchi|parmigiana|pizza|focaccia|ricotta|mozzarella|burrata|bruschetta|italien/],
  ['asiatique', /soja|miso|ramen|nouilles|udon|soba|sesame|gochujang|kimchi|wok|pad thai|teriyaki|japonais|coreen|thai|vietnam|bao|dumpling|gyoza|riz gluant|mochi|sriracha|curry japonais|nuoc|citronnelle|galanga|bibimbap|onigiri|tofu soyeux/],
  ['mexicaine', /tacos?|tortilla|guacamole|burrito|fajitas?|quesadilla|chili sin carne|chili con|nachos|enchilada|jalapeno|mexicain/],
  ['mediterraneenne', /tzatziki|moussaka|spanakopita|feta|grec|ratatouille|gaspacho|tapas|paella|espagnol|olives? noires|aubergines? a la/],
  ['francaise', /gratin|quiche|blanquette|veloute|bourguignon|croque|crepe|galette bretonne|tartiflette|hachis|soupe a l oignon|pot au feu|vinaigrette|francais/],
]

const MOOD_HINTS: [string, RegExp][] = [
  ['reconfortant', /gratin|curry|soupe|veloute|ragout|mijote|puree|creme|fromage|lasagne|risotto|dahl|chili|tartiflette|hachis|parmigiana|pates cremeuses|mac|raclette|fondue|potee|crumble/],
  ['leger', /salade|vapeur|bowl|crudites|taboule|gaspacho|poke|carpaccio|tartare de legumes|rouleaux de printemps|concombre/],
  ['epice', /piment|harissa|chili|curry|sriracha|gochujang|cayenne|jalapeno|tandoori|epice|masala|wasabi|chipotle/],
]

const textOf = (title: string, lines: string[]) => fold(`${title} ${lines.join(' ')}`).replace(/['’-]/g, ' ')

/** La cuisine du monde devinée (null si rien de net : il faut un indice dans le titre, ou deux dans les ingrédients). Le titre compte double. */
export function guessCuisine(title: string, lines: string[]): string | null {
  const t = fold(title).replace(/['’-]/g, ' ')
  const all = textOf(title, lines)
  let best: string | null = null
  let bestScore = 1
  for (const [id, re] of CUISINE_HINTS) {
    const g = new RegExp(re.source, 'g')
    const score = (all.match(g)?.length ?? 0) + (t.match(g)?.length ?? 0)
    if (score > bestScore) { best = id; bestScore = score }
  }
  return best
}

/** Les envies devinées. */
export function guessMoods(title: string, lines: string[]): string[] {
  const all = textOf(title, lines)
  return MOOD_HINTS.filter(([, re]) => re.test(all)).map(([id]) => id)
}

/** La valeur choisie à la main l'emporte ; sinon, celle devinée. */
export function cuisineOf(title: string, lines: string[], chosen: unknown): string | null {
  return typeof chosen === 'string' && chosen ? chosen : guessCuisine(title, lines)
}
export function moodsOf(title: string, lines: string[], chosen: unknown): string[] {
  return Array.isArray(chosen) && chosen.length > 0 ? chosen.filter((x): x is string => typeof x === 'string') : guessMoods(title, lines)
}

export type TimeBucket = 'rapide' | 'moyen' | 'long'
export const TIME_BUCKETS: { id: TimeBucket; label: string }[] = [
  { id: 'rapide', label: '30 min ou moins' },
  { id: 'moyen', label: '30 min à 1 h' },
  { id: 'long', label: 'Plus d’1 h' },
]
export function timeBucket(minutes: number | null): TimeBucket | null {
  if (minutes === null || minutes <= 0) return null
  return minutes <= 30 ? 'rapide' : minutes <= 60 ? 'moyen' : 'long'
}

/**
 * « J'ai des courgettes, des pois chiches » : combien des ingrédients cherchés la recette utilise.
 * La recherche accepte virgules, « et », pluriels et accents.
 */
export function ingredientWords(query: string): string[] {
  return fold(query).replace(/['’]/g, ' ').trim()
    .replace(/^(j ?ai|il me reste|avec)\s+/, '')
    .split(/,|;|\set\s|\s\+\s/)
    .map((w) => w.replace(/^(des|du|de la|de l|de|un|une|les|la|le|l)\s+/, '').trim())
    .filter((w) => w.length >= 3)
}
export function ingredientHits(lines: string[], words: string[]): number {
  const text = fold(lines.join(' | '))
  const stem = (w: string) => w.replace(/(s|x)$/, '')
  return words.filter((w) => text.includes(stem(w))).length
}

/** Ce qu'on sait d'une recette pour la filtrer. */
export interface RecipeFacts {
  minutes: number | null
  inSeason: string[]
  outOfSeason: string[]
  veg: boolean
  cuisine: string | null
  moods: string[]
  lines: string[]
}

export interface RecipeFilters {
  season: boolean
  time: TimeBucket | null
  cuisines: string[]
  moods: string[]
  /** « J'ai… » : ingrédients à utiliser. */
  have: string
}
export const NO_FILTERS: RecipeFilters = { season: false, time: null, cuisines: [], moods: [], have: '' }
export const hasFilters = (f: RecipeFilters) => f.season || f.time !== null || f.cuisines.length > 0 || f.moods.length > 0 || ingredientWords(f.have).length > 0

/** De saison : au moins un fruit ou légume du mois, et aucun d'une autre saison. */
export const isInSeason = (f: RecipeFacts) => f.inSeason.length > 0 && f.outOfSeason.length === 0

/** Le nombre d'ingrédients « J'ai… » trouvés (1 si la recherche est vide), ou 0 si la recette ne passe pas les filtres. */
export function filterScore(f: RecipeFacts, flt: RecipeFilters): number {
  if (flt.season && !isInSeason(f)) return 0
  if (flt.time && timeBucket(f.minutes) !== flt.time) return 0
  if (flt.cuisines.length > 0 && (!f.cuisine || !flt.cuisines.includes(f.cuisine))) return 0
  if (flt.moods.length > 0 && !flt.moods.some((m) => f.moods.includes(m))) return 0
  const words = ingredientWords(flt.have)
  if (words.length === 0) return 1
  return ingredientHits(f.lines, words)
}
