// Meal prep : à partir des recettes de la semaine, une seule séance de cuisine (mise en place commune, cuissons en lot, ordre de passage)
// et la conservation de chaque plat selon le jour où on le mange. Et des idées de meal prep avec les recettes de Victor.
// Logique pure, testée automatiquement. Les durées de conservation sont des repères prudents (frigo à 4 °C au plus), pas des règles absolues.

import { aisleOf, buildShoppingList, fold, ingredientKey, parseLine, type ShoppingSource } from './shoppingList'
import { DAY_NAMES, type Meal } from './mealPlan'

// ───────────────────────── Lire une recette ─────────────────────────

interface BlockLike {
  type?: string
  props?: Record<string, unknown>
  content?: unknown
  children?: BlockLike[]
}
const textOf = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return (content as { text?: string }[]).map((c) => (c && typeof c === 'object' ? c.text ?? '' : '')).join('')
}

/** Les étapes d'une recette (liste sous « Étapes »), et celles de sa version sans viande (« Ce qui change »). */
export function readSteps(blocks: unknown): { steps: string[]; variantSteps: string[] } {
  const steps: string[] = []
  const variantSteps: string[] = []
  let mode: 'none' | 'steps' | 'variant' = 'none'
  let inVariant = false
  const walk = (list: BlockLike[]) => {
    for (const b of list) {
      if (b.type === 'heading') {
        const t = fold(textOf(b.content))
        if (t.startsWith('version sans')) { inVariant = true; mode = 'none' } else if (inVariant && t.startsWith('ce qui change')) mode = 'variant'
        else if (inVariant && Number(b.props?.level ?? 1) >= 3) mode = 'none'
        else { inVariant = false; mode = t.startsWith('etape') || t.startsWith('preparation') || t.startsWith('instructions') ? 'steps' : 'none' }
      } else if (mode !== 'none' && (b.type === 'numberedListItem' || b.type === 'bulletListItem' || b.type === 'paragraph')) {
        const text = textOf(b.content).trim()
        if (text) (mode === 'steps' ? steps : variantSteps).push(text)
      }
      if (b.children?.length) walk(b.children)
    }
  }
  walk((Array.isArray(blocks) ? blocks : []) as BlockLike[])
  return { steps, variantSteps }
}

const DURATION = /(\d+(?:[.,]\d+)?)(?:\s*(?:à|-|–)\s*(\d+(?:[.,]\d+)?))?\s*(h(?:eures?)?|min(?:utes?)?)(?![a-zà-ÿ])/gi

/** Somme des durées écrites dans les étapes (« cuire 20 min », « 1 h »), en minutes. Une fourchette compte pour sa moyenne. */
export function stepsMinutes(steps: string[]): number {
  let total = 0
  for (const s of steps) {
    for (const m of s.matchAll(DURATION)) {
      const a = Number(m[1].replace(',', '.'))
      const v = m[2] ? (a + Number(m[2].replace(',', '.'))) / 2 : a
      total += /^h/i.test(m[3]) ? v * 60 : v
    }
  }
  return Math.round(total)
}

/** La température du four citée dans les étapes (180 pour « four à 180 °C »), ou null. */
export function ovenTemp(steps: string[]): number | null {
  for (const s of steps) {
    if (!/four|air ?fry/i.test(s)) continue
    const m = /(\d{3})\s*°\s*C?/.exec(s)
    if (m) return Number(m[1])
  }
  return null
}

// ───────────────────────── Conservation ─────────────────────────

export interface KeepInfo {
  /** Jours au réfrigérateur après la séance. */
  fridgeDays: number
  freezer: boolean
  /** Mieux fait le jour même (croustillant, avocat, salade verte, œuf poché…). */
  sameDay: boolean
  /** Se garde à température ambiante, dans une boîte (crackers, biscuits). */
  pantry: boolean
  tips: string[]
  reheat: string
}

const any = (s: string, re: RegExp) => re.test(s)

/** Comment se garde un plat, d'après son titre, ses ingrédients et ses étapes. */
export function keepInfo(title: string, lines: string[], steps: string[]): KeepInfo {
  // Les mesures (« c. à soupe ») ne doivent pas faire croire à une soupe.
  const clean = (x: string) => fold(x).replace(/c\.?\s?a\s?(soupe|cafe)|cuilleres? a (soupe|cafe)/g, ' ')
  const t = fold(title)
  const all = clean([title, ...lines, ...steps].join(' '))
  const ing = clean(lines.join(' '))
  const tips: string[] = []
  let fridgeDays = 3
  let freezer = false
  let sameDay = false
  let pantry = false
  let reheat = 'Au micro-ondes, couvert, avec une cuillère d’eau, en remuant à mi-chemin.'

  if (any(t, /cracker|biscuit|granola|cookie|barre/)) {
    pantry = true
    fridgeDays = 7
    reheat = 'Rien à réchauffer.'
    tips.push('Dans une boîte hermétique, à l’abri de l’humidité.')
  } else if (any(all, /curry|masala|dahl|\bdal\b|chili|soupe|veloute|ragout|mijot|bolognaise|chana|rajma|tikka|makhani|korma|bhaji|ajvar|boulette|galette|ratatouille|tajine|sauce tomate/)) {
    fridgeDays = 4
    freezer = true
    reheat = 'À la casserole à feu doux avec un trait d’eau, ou 2 à 3 min au micro-ondes en remuant.'
    if (any(ing, /creme|yaourt|lait\b/)) tips.push('Si possible, congeler sans la crème ou le yaourt et les ajouter au réchauffage (ils peuvent trancher).')
  }
  if (any(all, /\bpane(e|es|s)?\b|\bpaner\b|panure|panko|katsu|\bfrit(e|es|s)?\b|\bfrire\b|friture|croustillant|tempura|beignet/)) {
    sameDay = true
    tips.push('Le croustillant ne se garde pas : préparer le reste à l’avance, paner et frire (ou réchauffer au four) le jour même.')
  }
  if (any(ing, /avocat|salade verte|roquette|mache|laitue|jeunes pousses/) && !any(t, /curry|soupe/)) {
    sameDay = true
    tips.push('Avocat et salade verte : à couper au moment du repas.')
  }
  if (any(all, /oeufs? poch|oeufs? mollet|œufs? poch|œufs? mollet|cuits? 6 min/)) tips.push('Œufs pochés ou mollets : à cuire le jour même (les œufs durs, eux, tiennent 4 jours).')
  if (any(ing, /\briz\b/)) {
    fridgeDays = Math.min(fridgeDays, 3)
    tips.push('Riz : le refroidir vite (étalé, au frais en moins d’une heure) et le réchauffer bien chaud.')
  }
  if (any(ing.replace(/pates? d(e |'|’| )/g, ' '), /\bpates?\b|spaghetti|nouille|ramen|penne|tagliatelle/)) {
    fridgeDays = Math.min(fridgeDays, 3)
    tips.push('Pâtes : les garder à part de la sauce, ou les cuire au dernier moment.')
  }
  if (any(ing, /persil|coriandre fraiche|menthe|basilic|aneth|ciboulette|coriandre$/) || any(ing, /\bcoriandre\b(?! moulue)/)) tips.push('Herbes fraîches : à ajouter au moment de servir.')
  if (any(ing, /poisson|saumon|thon|cabillaud|crevette/)) fridgeDays = Math.min(fridgeDays, 2)
  return { fridgeDays, freezer, sameDay, pantry, tips: [...new Set(tips)], reheat }
}

// ───────────────────────── La séance de cuisine ─────────────────────────

export interface PrepRecipe {
  id: string
  title: string
  /** Lignes d'ingrédients à acheter (version sans viande si elle existe). */
  lines: string[]
  /** Facteur des quantités (personnes prévues au total / personnes de la recette). */
  factor: number
  steps: string[]
  variantSteps: string[]
  /** Temps actif (propriété « Préparation ») et cuisson, en minutes, s'ils sont connus. */
  prep: number | null
  cook: number | null
  /** Les repas de la semaine où on la mange. */
  meals: { day: number; meal: Meal }[]
}

export interface PrepTask {
  text: string
  recipes: string[]
}

export interface StorageLine {
  recipe: string
  id: string
  meals: { label: string; where: 'frigo' | 'congélateur' | 'jour même' | 'boîte' }[]
  info: KeepInfo
}

export interface CookStep {
  id: string
  title: string
  minutes: number
  oven: number | null
  steps: string[]
  variantSteps: string[]
}

export interface PrepSession {
  /** À lancer en premier : trempage, four, cuissons longues de base. */
  first: PrepTask[]
  /** Mise en place commune : tout ce qui se coupe, en une fois. */
  miseEnPlace: PrepTask[]
  /** Les plats, dans l'ordre où les lancer. */
  cooking: CookStep[]
  storage: StorageLine[]
  /** Durée estimée de la séance, en minutes. */
  minutes: number
}

/** Ce qui se prépare à l'avance pour chaque légume ou aromate (le verbe et le complément). */
const PREP_RULES: { re: RegExp; verb: string; keepApart?: boolean }[] = [
  { re: /^oignon(?! nouveau)|^oignon rouge|^oignon jaune|^oignon blanc/, verb: 'Éplucher et émincer' },
  { re: /^echalote/, verb: 'Éplucher et ciseler' },
  { re: /^ail$/, verb: 'Éplucher et hacher' },
  { re: /^gingembre/, verb: 'Éplucher et râper' },
  { re: /^carotte/, verb: 'Éplucher et couper' },
  { re: /^pomme de terre|^patate/, verb: 'Éplucher et couper en cubes (à garder dans l’eau froide)' },
  { re: /^tomate$|^tomates?$/, verb: 'Couper en dés' },
  { re: /^poivron/, verb: 'Épépiner et couper' },
  { re: /^courgette|^aubergine/, verb: 'Couper' },
  { re: /^champignon/, verb: 'Nettoyer et émincer' },
  { re: /^chou fleur|^brocoli/, verb: 'Détailler en fleurettes' },
  { re: /^epinard|^jeune pousse/, verb: 'Laver et essorer' },
  { re: /^piment vert|^piment$|^jalapeno/, verb: 'Épépiner et émincer' },
  { re: /^persil|^coriandre$|^menthe|^aneth|^ciboulette|^basilic/, verb: 'Laver et ciseler (à garder à part, au frais dans un papier humide)', keepApart: true },
  { re: /^citron/, verb: 'Presser (ou garder entier pour le service)' },
  { re: /^concombre/, verb: 'Couper (à garder à part, il rend de l’eau)', keepApart: true },
  { re: /^chou\b(?! fleur)/, verb: 'Émincer' },
  { re: /^poireau|^celeri|^fenouil/, verb: 'Laver et émincer' },
]

const BATCH_RULES: { re: RegExp; text: (qty: string) => string }[] = [
  { re: /^riz\b/, text: (q) => `Cuire tout le riz en une fois (${q}, environ 15 min), puis l’étaler pour qu’il refroidisse vite.` },
  { re: /^quinoa/, text: (q) => `Cuire tout le quinoa en une fois (${q}, environ 12 min).` },
  { re: /^boulgour|^semoule/, text: (q) => `Préparer la semoule ou le boulgour en une fois (${q}).` },
]

const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}` : `${m} min`)
export { fmtMinutes }

/** Le jour de la séance : -1 = le dimanche avant la semaine, 0 = lundi… */
export function mealLabel(day: number, meal: Meal) {
  return `${DAY_NAMES[day]} ${meal === 'midi' ? 'midi' : 'soir'}`
}

/** Prépare la séance de cuisine de la semaine. `prepDay` : -1 (dimanche d'avant) à 6. */
export function buildSession(recipes: PrepRecipe[], prepDay = -1): PrepSession {
  const sources: ShoppingSource[] = recipes.map((r) => ({ recipe: r.title, lines: r.lines, factor: r.factor }))
  const items = buildShoppingList(sources)

  // Mise en place commune : légumes et aromates, avec les quantités de toute la semaine.
  const miseEnPlace: PrepTask[] = []
  const apart: PrepTask[] = []
  for (const item of items) {
    const key = item.id.split('|')[0]
    if (item.aisle !== 'Fruits et légumes') continue
    const rule = PREP_RULES.find((r) => r.re.test(key))
    if (!rule) continue
    const task = { text: `${rule.verb} : ${item.text}`, recipes: item.recipes }
    ;(rule.keepApart ? apart : miseEnPlace).push(task)
  }
  // Les ingrédients communs à plusieurs recettes d'abord : c'est là qu'on gagne du temps.
  miseEnPlace.sort((a, b) => b.recipes.length - a.recipes.length)

  // À lancer en premier : trempage des légumineuses sèches, four, cuissons de base en lot.
  const first: PrepTask[] = []
  const dry = new Map<string, string[]>()
  for (const r of recipes) {
    for (const l of r.lines) {
      const f = fold(l)
      if (/(lentille|pois chiche|haricot)/.test(f) && /\b(sec|seche|secs|seches|a tremper|trempe)/.test(f) && !/cuit|boite|conserve|egoutt/.test(f)) {
        const k = ingredientKey(parseLine(l).name)
        dry.set(k, [...(dry.get(k) ?? []), r.title])
      }
    }
  }
  for (const [k, rs] of dry) first.push({ text: `La veille : faire tremper ${k}s dans un grand volume d’eau froide (8 à 12 h).`, recipes: [...new Set(rs)] })
  const ovens = recipes.map((r) => ({ r, t: ovenTemp([...r.steps, ...r.variantSteps]) })).filter((x) => x.t !== null)
  if (ovens.length > 0) {
    const temp = Math.max(...ovens.map((x) => x.t as number))
    first.push({ text: `Préchauffer le four à ${temp} °C${ovens.length > 1 ? ' : les plats au four cuisent ensemble (ajuster la température au besoin)' : ''}.`, recipes: ovens.map((x) => x.r.title) })
  }
  for (const item of items) {
    const key = item.id.split('|')[0]
    const rule = BATCH_RULES.find((b) => b.re.test(key))
    if (rule) first.push({ text: rule.text(item.text.replace(/\s+d[e’'].*$/, '').trim()), recipes: item.recipes })
  }

  // Les plats : d'abord ceux du four, puis du plus long au plus court.
  const cooking: CookStep[] = recipes
    .map((r) => {
      const all = [...r.steps, ...r.variantSteps]
      // Cuisson : celle de la recette, sinon les durées écrites dans les étapes ; travail : celui de la recette, sinon ~3 min par étape.
      const cook = r.cook ?? stepsMinutes(all)
      const work = r.prep ?? all.length * 3
      const minutes = Math.max(15, Math.round((cook + work) / 5) * 5)
      return { id: r.id, title: r.title, minutes, oven: ovenTemp([...r.steps, ...r.variantSteps]), steps: r.steps, variantSteps: r.variantSteps }
    })
    .sort((a, b) => Number(b.oven !== null) - Number(a.oven !== null) || b.minutes - a.minutes)

  // Conservation : frigo si on le mange dans les jours qui suivent, sinon congélateur (ou le jour même).
  const storage: StorageLine[] = recipes.map((r) => {
    const info = keepInfo(r.title, r.lines, [...r.steps, ...r.variantSteps])
    const meals = [...r.meals]
      .sort((a, b) => a.day - b.day || (a.meal === 'midi' ? -1 : 1))
      .map((m) => {
        const days = m.day - prepDay
        const where: StorageLine['meals'][number]['where'] = info.pantry ? 'boîte' : info.sameDay ? 'jour même' : days <= info.fridgeDays ? 'frigo' : info.freezer ? 'congélateur' : 'jour même'
        return { label: mealLabel(m.day, m.meal), where }
      })
    return { recipe: r.title, id: r.id, meals, info }
  })

  // Durée : les cuissons se chevauchent (la plus longue compte entière), le travail actif s'additionne, la mise en place partagée fait gagner du temps.
  // Le plat le plus long compte en entier, les autres pour moitié (leurs cuissons se chevauchent), plus 15 min de mise en place.
  const longest = cooking.reduce((m, c) => Math.max(m, c.minutes), 0)
  const others = cooking.reduce((s, c) => s + c.minutes, 0) - longest
  const minutes = Math.round((longest + others * 0.5 + 15) / 5) * 5

  return { first, miseEnPlace: [...miseEnPlace, ...apart], cooking, storage, minutes }
}

// ───────────────────────── Idées de meal prep ─────────────────────────

export interface CandidateRecipe {
  id: string
  title: string
  lines: string[]
  steps: string[]
  /** Catégorie de la recette (plats, midi…). */
  type: string | null
}

export interface PrepIdea {
  ids: string[]
  titles: string[]
  shared: string[]
  reasons: string[]
  score: number
}

const MEAT = /\b(poulet|boeuf|bœuf|porc|agneau|veau|lardon|jambon|bacon|chorizo|saucisse|dinde|canard|merguez|steak hache|viande|poisson|saumon|thon|cabillaud|crevette|sardine|anchois)\b/
const BASIC = new Set(['sel', 'poivre', 'huile', 'huile d olive', 'huile neutre', 'eau', 'sucre', 'beurre', 'farine'])
const PROTEINS: [RegExp, string][] = [[/pois chiche/, 'pois chiches'], [/lentille/, 'lentilles'], [/haricot/, 'haricots'], [/tofu/, 'tofu'], [/paneer/, 'paneer'], [/oeuf|œuf/, 'œufs'], [/tempeh/, 'tempeh'], [/feta|fromage/, 'fromage']]

/** Ce qui rend une recette bonne pour un meal prep (négatif : à éviter). */
export function prepScore(c: CandidateRecipe): number {
  const k = keepInfo(c.title, c.lines, c.steps)
  return (k.freezer ? 2 : 0) + (k.fridgeDays >= 4 ? 1 : 0) - (k.sameDay ? 3 : 0)
}

const mainProtein = (lines: string[]) => {
  const f = fold(lines.join(' '))
  return PROTEINS.find(([re]) => re.test(f))?.[1] ?? null
}

/** Des idées de trois recettes à cuisiner ensemble : qui se gardent bien, partagent des ingrédients, et varient les protéines. */
export function suggestIdeas(candidates: CandidateRecipe[], count = 3): PrepIdea[] {
  // Le nom à afficher pour chaque ingrédient (« crème », pas la clé « creme ») : le premier tel qu'écrit, sans précisions, au singulier.
  const niceName = new Map<string, string>()
  for (const c of candidates) {
    for (const l of c.lines) {
      const p = parseLine(l)
      if (p.key && !niceName.has(p.key)) niceName.set(p.key, p.name.split(/[,(]/)[0].trim().toLowerCase().replace(/^(\S+?)s(\s|$)/, '$1$2'))
    }
  }
  const pool = candidates
    .filter((c) => c.lines.length >= 3 && (c.type === null || c.type === 'plats' || c.type === 'midi'))
    .filter((c) => !MEAT.test(fold(c.lines.join(' '))))
    .map((c) => ({ c, s: prepScore(c), keys: new Set(c.lines.map((l) => parseLine(l)).filter((p) => p.key && !BASIC.has(p.key) && aisleOf(p.name) !== 'Épices et condiments').map((p) => p.key)), protein: mainProtein(c.lines) }))
    .filter((x) => x.s >= 1)
    .sort((a, b) => b.s - a.s || b.keys.size - a.keys.size)
    .slice(0, 24)
  const triples: PrepIdea[] = []
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        const g = [pool[i], pool[j], pool[k]]
        const counts = new Map<string, number>()
        for (const x of g) x.keys.forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1))
        const shared = [...counts].filter(([, n]) => n >= 2).map(([key]) => niceName.get(key) ?? key)
        const proteins = new Set(g.map((x) => x.protein).filter(Boolean))
        const score = g.reduce((s, x) => s + x.s, 0) + shared.length * 1.5 + proteins.size * 1.5
        const reasons: string[] = []
        if (g.every((x) => keepInfo(x.c.title, x.c.lines, x.c.steps).freezer)) reasons.push('tout se congèle')
        if (proteins.size >= 2) reasons.push(`protéines variées : ${[...proteins].join(', ')}`)
        triples.push({ ids: g.map((x) => x.c.id), titles: g.map((x) => x.c.title), shared: shared.slice(0, 6), reasons, score })
      }
    }
  }
  triples.sort((a, b) => b.score - a.score)
  // Des idées différentes : chaque nouvelle idée partage au plus une recette avec les précédentes.
  const out: PrepIdea[] = []
  for (const t of triples) {
    if (out.every((o) => o.ids.filter((id) => t.ids.includes(id)).length <= 1)) out.push(t)
    if (out.length >= count) break
  }
  return out
}

/** Où placer les trois recettes d'une idée dans la semaine : deux repas chacune du lundi au mercredi, puis un chacune jeudi et vendredi. */
export const IDEA_SLOTS: { recipe: number; day: number; meal: Meal }[] = [
  { recipe: 0, day: 0, meal: 'midi' }, { recipe: 1, day: 0, meal: 'soir' },
  { recipe: 2, day: 1, meal: 'midi' }, { recipe: 0, day: 1, meal: 'soir' },
  { recipe: 1, day: 2, meal: 'midi' }, { recipe: 2, day: 2, meal: 'soir' },
  { recipe: 0, day: 3, meal: 'midi' }, { recipe: 1, day: 3, meal: 'soir' },
  { recipe: 2, day: 4, meal: 'midi' },
]
