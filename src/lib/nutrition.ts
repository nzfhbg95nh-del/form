// Nutrition d'une recette : chaque ingrédient est reconnu dans la table Ciqual 2020 (ANSES), converti en grammes, puis ses nutriments
// sont additionnés et ramenés à une personne. Une valeur inconnue dans Ciqual reste inconnue (jamais inventée) ; un ingrédient non reconnu
// ou sans quantité est signalé. Logique pure, testée automatiquement ; la table est chargée à part (src/data/ciqual2020.json).

import { convertLine, DEFAULT_EQUIVALENCES, parseEquivalences, type EquivalenceTable } from './recipeUnits'
import { fold, ingredientKey, parseLine } from './shoppingList'

export const NUTRIENT_KEYS = [
  'kcal', 'prot', 'gluc', 'sucres', 'fibres', 'lip', 'ags', 'agmi', 'agpi', 'ala', 'la', 'epa', 'dha',
  'sel', 'ca', 'fe', 'mg', 'zn', 'iode', 'k', 'se', 'vitc', 'b9', 'b12', 'vitd', 'vite', 'retinol', 'bcarotene', 'b2', 'chol',
] as const
export type NutrientKey = (typeof NUTRIENT_KEYS)[number]

export interface CiqualData {
  source: string
  nutrients: string[]
  groups: Record<string, string>
  /** [code, nom, groupe, valeurs pour 100 g (null = inconnu)] */
  foods: [number, string, string, (number | null)[]][]
}

export interface Food {
  code: number
  name: string
  group: string
  per100: Partial<Record<NutrientKey, number | null>>
  /** Nom replié (minuscules, sans accents) et ses mots, pour la recherche. */
  folded: string
  head: string[]
  tail: string[]
}

const STOP = new Set(['de', 'd', 'du', 'des', 'la', 'le', 'les', 'l', 'en', 'au', 'aux', 'et', 'a', 'pour', 'ou', 'avec', 'sans', 'type', 'facon'])
const words = (s: string) => fold(s).replace(/['’]/g, ' ').split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)).map((w) => (w.length > 3 && /[sx]$/.test(w) && !/(ss|is|us|os|as)$/.test(w) ? w.slice(0, -1) : w))

export function loadFoods(data: CiqualData): Food[] {
  const idx = data.nutrients.map((n) => n as NutrientKey)
  return data.foods.map(([code, name, group, values]) => {
    const per100: Food['per100'] = {}
    idx.forEach((k, i) => { per100[k] = values[i] ?? null })
    const [head, ...rest] = name.split(',')
    return { code, name, group, per100, folded: fold(name), head: words(head), tail: words(rest.join(' ')) }
  })
}

// ───────────────────────── Reconnaître un ingrédient ─────────────────────────

/**
 * Correspondances sûres pour les ingrédients courants : clé d'ingrédient (début) -> début du nom Ciqual.
 * Testées dans l'ordre ; la première qui correspond gagne. « cuit » / « boîte » choisissent la version cuite ou en conserve.
 */
export const ALIASES: [RegExp, string][] = [
  [/basilic/, 'Basilic, frais'],
  [/aneth/, 'Aneth, frais'],
  [/ciboulette|ciboule/, 'Ciboule ou Ciboulette, fraîche'],
  [/^thym/, 'Thym, frais'],
  [/fecule de mais|amidon de mais|maizena/, 'Amidon de maïs ou fécule de maïs'],
  [/puree d amande|beurre d amande/, 'Amande (avec peau)'],
  [/graine de fenouil/, 'Fenouil, graine'],
  [/graine de fenugrec|^fenugrec|kasuri|methi/, 'Fenugrec, graine'],
  [/graine de tournesol/, 'Tournesol, graine'],
  [/graine de courge|graine de potiron/, 'Cucurbitacées, graine'],
  [/^capre/, 'Câpres, au vinaigre'],
  [/jus d.{0,12}(citron vert|lime)/, 'Jus de citron vert, pur jus'],
  [/jus d.{0,12}citron/, 'Jus de citron, pur jus'],
  [/zeste d(e)? ?citron/, 'Citron, zeste, cru'],
  [/^blanc d ?oeuf|^blanc d oeuf/, "Oeuf, blanc (blanc d'oeuf), cru"],
  [/^cerneau/, 'Noix, séchée, cerneaux'],
  [/epinard/, 'Épinard, cru'],
  [/^poi$|^poi surgele|^petit poi/, 'Petits pois, surgelés, crus'],
  [/passata|pulpe de tomate/, 'Tomate, purée, appertisée'],
  [/flocon de piment|piment en poudre|piment d alep|piment de cayenne|piment du cachemire|piment rouge/, 'Piment, cru'],
  [/^cassonade|^sucre roux|^sucre de canne/, 'Sucre roux'],
  [/^fromage blanc|^skyr/, 'Fromage blanc nature, 3% MG environ'],
  [/^pain de mie/, 'Pain de mie, courant'],
  [/^mie de pain|^pain\b(?! pita)/, 'Pain (aliment moyen)'],
  [/^tortilla/, 'Tortilla souple (à garnir), à base de blé'],
  [/^chocolat noir|^pepite de chocolat/, 'Chocolat noir à moins de 70% de cacao, à croquer, tablette'],
  [/^cardamome/, 'Cardamome, poudre'],
  [/^pois chiche.*(sec|trempe)/, 'Pois chiche, sec'],
  [/^pois chiche/, 'Pois chiche, appertisé, égoutté'],
  [/^lentille corail.*cuit/, 'Lentille corail, bouillie/cuite à l\'eau'],
  [/^lentille corail/, 'Lentille corail, sèche'],
  [/^lentille.*cuit/, 'Lentille verte, bouillie/cuite à l\'eau'],
  [/^lentille/, 'Lentille verte, sèche'],
  [/^haricot rouge/, 'Haricot rouge, appertisé, égoutté'],
  [/^haricot blanc/, 'Haricot blanc, appertisé, égoutté'],
  [/^haricot vert/, 'Haricot vert, cru'],
  [/^petit poi/, 'Petits pois, surgelés, crus'],
  [/^tofu fume/, 'Tofu fumé, préemballé'],
  [/^tofu soyeux/, 'Tofu soyeux, préemballé'],
  [/^tofu/, 'Tofu nature, préemballé'],
  [/^paneer/, 'Mozzarella au lait de vache'],
  [/^feta/, 'Feta'],
  [/^mozzarella/, 'Mozzarella au lait de vache'],
  [/^parmesan/, 'Parmesan'],
  [/^yaourt grec/, 'Yaourt à la grecque, nature'],
  [/^yaourt/, 'Yaourt, lait fermenté ou spécialité laitière, nature'],
  [/^fromage frai/, 'Fromage frais type petit suisse, nature, 4% MG environ'],
  [/^creme fraiche|^creme epaisse/, 'Crème de lait, 30% MG, épaisse'],
  [/^creme/, 'Crème de lait, 15 à 20% MG, légère, épaisse'],
  [/^lait de coco|^creme de coco/, 'Lait de coco ou Crème de coco'],
  [/^lait/, 'Lait demi-écrémé, UHT'],
  [/^beurre de cacahuete/, 'Beurre de cacahuète ou Pâte d\'arachide'],
  [/^beurre|^ghee/, 'Beurre à 82% MG, doux'],
  [/^oeuf|^œuf/, 'Oeuf, cru'],
  [/^huile d olive|^huile olive/, 'Huile d\'olive vierge extra'],
  [/^huile de colza/, 'Huile de colza'],
  [/^huile de sesame/, 'Huile de sésame'],
  [/^huile/, 'Huile de tournesol'],
  [/^oignon nouveau|^oignon vert|^cebette/, 'Oignon nouveau ou oignon frais ou cébette, sauté/poêlé sans matière grasse'],
  [/^oignon/, 'Oignon, cru'],
  [/^echalote/, 'Echalote, crue'],
  [/^ail en poudre/, 'Ail séché, poudre'],
  [/^ail/, 'Ail, cru'],
  [/^gingembre en poudre/, 'Gingembre, poudre'],
  [/^gingembre/, 'Gingembre, racine crue'],
  [/^tomate concasse|^tomate en conserve|^chair de tomate|^tomate pelee/, 'Tomate, pelée, appertisée, égouttée'],
  [/^concentre de tomate/, 'Tomate, concentré, appertisé'],
  [/^puree de tomate|^coulis|^sauce tomate/, 'Tomate, purée, appertisée'],
  [/^tomate seche/, 'Tomate, séchée'],
  [/^tomate/, 'Tomate, crue'],
  [/^carotte/, 'Carotte, crue'],
  [/^pomme de terre/, 'Pomme de terre, sans peau, crue'],
  [/^patate douce/, 'Patate douce, crue'],
  [/^epinard/, 'Épinard, cru'],
  [/^chou fleur/, 'Chou-fleur, cru'],
  [/^brocoli/, 'Brocoli, cru'],
  [/^aubergine/, 'Aubergine, crue'],
  [/^courgette/, 'Courgette, pulpe et peau, crue'],
  [/^poivron rouge/, 'Poivron rouge, cru'],
  [/^poivron vert/, 'Poivron vert, cru'],
  [/^poivron/, 'Poivron rouge, cru'],
  [/^champignon/, 'Champignon de Paris ou champignon de couche, cru'],
  [/^concombre/, 'Concombre, pulpe et peau, cru'],
  [/^avocat/, 'Avocat, pulpe, cru'],
  [/^citron vert/, 'Citron vert ou Lime, pulpe, cru'],
  [/^jus de citron/, 'Jus de citron, pur jus'],
  [/^citron/, 'Citron, pulpe, cru'],
  [/^piment/, 'Piment, cru'],
  [/^persil/, 'Persil, frais'],
  [/^coriandre moulue|^graine de coriandre/, 'Coriandre, graine'],
  [/^coriandre/, 'Coriandre, fraîche'],
  [/^menthe/, 'Menthe, fraîche'],
  [/^riz/, 'Riz blanc, cru'],
  [/^quinoa/, 'Quinoa, cru'],
  [/^pate|^spaghetti|^penne|^tagliatelle/, 'Pâtes sèches standard, crues'],
  [/^nouille|^ramen/, 'Pâtes ou nouilles asiatiques au blé et aux oeufs, crues, nature'],
  [/^farine/, 'Farine de blé tendre ou froment T55 (pour pains)'],
  [/^flocon d avoine|^avoine/, 'Flocon d\'avoine'],
  [/^panko|^chapelure/, 'Chapelure'],
  [/^pain pita|^pita/, 'Pain pita'],
  [/^naan/, 'Tortilla souple (à garnir), à base de blé'],
  [/^sucre/, 'Sucre blanc'],
  [/^miel/, 'Miel'],
  [/^noix de cajou|^cajou/, 'Noix de cajou, grillée, salée'],
  [/^cerneau de noix|^noix\b/, 'Noix, séchée, cerneaux'],
  [/^amande/, 'Amande (avec peau)'],
  [/^graine de courge/, 'Cucurbitacées, graine'],
  [/^graine de lin/, 'Lin, graine'],
  [/^graine de sesame|^sesame/, 'Sésame, graine'],
  [/^graine de chia|^chia/, 'Chia, graine, séchée'],
  [/^pignon/, 'Pignon de pin'],
  [/^tahini|^puree de sesame/, 'Tahin ou Purée de sésame'],
  [/^sauce soja/, 'Sauce soja, préemballée'],
  [/^cumin/, 'Cumin, graine'],
  [/^curcuma/, 'Curcuma, poudre'],
  [/^paprika/, 'Paprika'],
  [/^cannelle/, 'Cannelle, poudre'],
  [/^garam masala|^curry/, 'Curry, poudre'],
  [/^sel/, 'Sel blanc alimentaire, iodé, non fluoré'],
  [/^poivre/, 'Poivre noir, poudre'],
  [/^vinaigre/, 'Vinaigre'],
  [/^moutarde/, 'Moutarde'],
  [/^mayonnaise/, 'Mayonnaise'],
  [/^bouillon/, 'Bouillon de légumes, déshydraté reconstitué'],
  [/^mais\b/, 'Maïs doux, appertisé, égoutté'],
]

/** Les mots d'unité ou de contexte au début d'un nom (« bouquet de », « le jus d'un », « un peu de ») : retirés avant de chercher. */
const LEAD = /^(?:(?:le|la|les|un|une|du|de|des|quelques|environ|facultatif)\s+)*(?:(?:petite?s?|gros|grosse?s?|grande?s?|demi)\s+)?(?:peu|touche|baton|batons|bouquet|bouquets|pincee|pincees|feuille|feuilles|graine|graines|poignee|poignees|gousse|gousses|boite|boites|boule|boules|brin|brins|branche|branches|tige|tiges|tranche|tranches|morceau|morceaux|filet|trait|goutte|gouttes|portion|portions|sachet|cube|c a soupe|c a cafe|cuillere a soupe|cuillere a cafe)\s+(?:d un |d une |de |d |du |des )?/
export function stripUnits(s: string): string {
  let out = s.trim()
  for (let i = 0; i < 3; i++) {
    const next = out.replace(LEAD, '').trim()
    if (next === out) break
    out = next
  }
  return out
}

/** Ce qui ne compte pas dans la nutrition (eau, glaçons). */
const NOTHING = /^(eau|glacon)/

export interface Match {
  food: Food | null
  /** 'alias' : correspondance sûre ; 'search' : trouvée par les mots (à vérifier) ; 'manual' : choisie par Victor ; 'none' : rien trouvé. */
  how: 'alias' | 'search' | 'manual' | 'none' | 'ignored'
}

export class FoodIndex {
  readonly foods: Food[]
  private byCode = new Map<number, Food>()
  private byName = new Map<string, Food>()
  constructor(foods: Food[]) {
    this.foods = foods
    for (const f of foods) {
      this.byCode.set(f.code, f)
      this.byName.set(f.folded, f)
    }
  }
  get(code: number) { return this.byCode.get(code) ?? null }
  /** L'aliment dont le nom commence par `name` (le plus court s'il y en a plusieurs). */
  named(name: string): Food | null {
    const n = fold(name)
    const exact = this.byName.get(n)
    if (exact) return exact
    let best: Food | null = null
    for (const f of this.foods) if (f.folded.startsWith(n) && (!best || f.name.length < best.name.length)) best = f
    return best
  }
  /** Recherche par les mots : le nom principal de l'aliment doit contenir le premier mot de l'ingrédient. */
  search(text: string, limit = 8): Food[] {
    // Seulement les résultats crédibles (un mot qui ressemble ne suffit pas).
    return this.searchScored(stripUnits(fold(text).replace(/['’.]/g, ' ')), limit).filter((x) => x.s >= 1).map((x) => x.f)
  }
  searchScored(text: string, limit = 8): { f: Food; s: number }[] {
    const q = words(text)
    if (q.length === 0) return []
    const cooked = /\b(cuit|cuite|boite|conserve|egoutte)/.test(fold(text))
    const dry = /\b(sec|seche|secs|seches)\b/.test(fold(text))
    const scored: { f: Food; s: number }[] = []
    for (const f of this.foods) {
      if (!f.head.some((h) => h.startsWith(q[0]) || q[0].startsWith(h))) continue
      let s = 0
      for (const w of q) {
        if (f.head.some((h) => h === w)) s += 3
        else if (f.head.some((h) => h.startsWith(w) || w.startsWith(h))) s += 2
        else if (f.tail.some((h) => h.startsWith(w))) s += 1
      }
      s -= Math.max(0, f.head.length - q.length) * 0.7
      // Chaque mot important de l'ingrédient doit se retrouver dans le nom (« fleur d'hibiscus » n'est pas « fleur de sel »).
      const nameWords = [...f.head, ...f.tail]
      if (q.some((w) => w.length >= 4 && !nameWords.some((h) => h.startsWith(w.slice(0, 5)) || w.startsWith(h.slice(0, 5))))) s -= 4
      if (f.tail.includes('cru') || f.tail.includes('crue')) s += cooked || dry ? -1 : 1
      if (cooked && f.tail.some((t) => /cuit|appertise|egoutte|bouilli/.test(t))) s += 1.5
      if (dry && f.tail.some((t) => /^sec/.test(t))) s += 1.5
      // Le premier mot de l'aliment est celui de l'ingrédient : bonne piste (« Pain, … » pour « pain », pas « Fruit à pain »).
      s += f.head[0] === q[0] || f.head[0]?.startsWith(q[0]) ? 2 : -1
      if (f.group === '01') s -= 2.5 // plats composés
      if (f.group === '11') s -= 10 // aliments infantiles
      s -= f.name.length / 200
      scored.push({ f, s })
    }
    return scored.sort((a, b) => b.s - a.s).slice(0, limit)
  }
  /** L'aliment Ciqual d'un ingrédient (clé ou nom). Les choix de Victor (`manual`) passent avant tout. */
  match(name: string, manual?: Record<string, number | null>): Match {
    const key = ingredientKey(name)
    if (!key || NOTHING.test(key)) return { food: null, how: 'ignored' }
    if (manual && key in manual) {
      const code = manual[key]
      return code === null ? { food: null, how: 'ignored' } : { food: this.get(code), how: 'manual' }
    }
    const raw = fold(name).replace(/['’.]/g, ' ').replace(/\s+/g, ' ').trim()
    const stripped = stripUnits(raw)
    const strippedKey = ingredientKey(stripped)
    if (!strippedKey || NOTHING.test(strippedKey)) return { food: null, how: 'ignored' }
    for (const [re, target] of ALIASES) {
      if (re.test(key) || re.test(raw) || re.test(strippedKey) || re.test(stripped)) {
        const f = this.named(target)
        if (f) return { food: f, how: 'alias' }
      }
    }
    const found = this.searchScored(stripped, 1)[0]
    // Un résultat douteux vaut moins que « non reconnu » : il faut que la plupart des mots se retrouvent dans le nom de l'aliment.
    return found && found.s >= Math.max(2.5, words(stripped).length * 1.6) ? { food: found.f, how: 'search' } : { food: null, how: 'none' }
  }
}

// ───────────────────────── Quantités en grammes ─────────────────────────

const TABLE: EquivalenceTable = parseEquivalences(DEFAULT_EQUIVALENCES)

/** Poids d'une pièce que la table d'équivalences laisse telle quelle (« garder »), et des unités comptées. */
const PIECES: [RegExp, number][] = [
  [/^(oeuf|œuf)/, 50], [/^gousse|^ail$/, 5], [/^citron vert/, 60], [/^citron/, 100], [/^lime/, 60],
  [/^pincee/, 0.5], [/^feuille/, 0.3], [/^branche|^brin/, 2], [/^bouquet|^botte/, 40], [/^tranche/, 30], [/^poignee|^petite poignee/, 25],
  [/^cm/, 5], [/^pouce/, 15], [/^baton/, 2], [/^cube/, 10], [/^filet/, 5], [/^trait/, 3], [/^noix$/, 10], [/^sachet/, 10],
  [/^pain pita|^pita/, 60], [/^naan/, 90], [/^pav|^petit pain/, 50], [/^piment/, 10], [/^cardamome/, 0.3], [/^clou/, 0.1], [/^laurier/, 0.2],
  [/^tasse/, 150], [/^verre/, 150], [/^pot/, 125], [/^bocal/, 350], [/^paquet/, 125], [/^bloc/, 200], [/^boite/, 240], [/^brique/, 200],
]
const DENSITY: [RegExp, number][] = [[/huile/, 0.92], [/miel|sirop/, 1.4], [/sauce soja/, 1.15], [/creme|lait|eau|jus|bouillon|vinaigre/, 1]]

export interface WeightedLine {
  line: string
  name: string
  key: string
  /** Grammes pour la recette entière, ou null si la quantité est inconnue (« Sel, poivre »). */
  grams: number | null
}

/** La quantité d'une ligne d'ingrédient en grammes (pour toute la recette), d'après la table d'équivalences et des poids de pièces. */
export function weighLine(line: string): WeightedLine {
  const converted = convertLine(line, TABLE)
  const p = parseLine(converted.status === 'converted' ? converted.text : line)
  const base = { line, name: p.name, key: p.key }
  if (p.qty === null) return { ...base, grams: null }
  if (p.family === 'g') return { ...base, grams: p.qty }
  if (p.family === 'ml') {
    const d = DENSITY.find(([re]) => re.test(p.key))?.[1] ?? 1
    return { ...base, grams: p.qty * d }
  }
  if (p.family === 'cas' || p.family === 'cac') {
    const ml = p.qty * (p.family === 'cas' ? 15 : 5)
    const d = DENSITY.find(([re]) => re.test(p.key))?.[1] ?? 0.6
    return { ...base, grams: ml * d }
  }
  const unitWord = p.family.startsWith('u:') ? p.family.slice(2) : ''
  const piece = PIECES.find(([re]) => re.test(unitWord))?.[1] ?? PIECES.find(([re]) => re.test(p.key))?.[1]
  return { ...base, grams: piece !== undefined ? p.qty * piece : null }
}

// ───────────────────────── Nutrition d'une recette ─────────────────────────

export type Totals = Partial<Record<NutrientKey, number>>

export interface IngredientNutrition extends WeightedLine {
  match: Match
}

export interface RecipeNutrition {
  /** Pour une personne. */
  perServing: Totals
  /** Nutriments pour lesquels au moins un ingrédient pesant n'a pas de valeur dans Ciqual (le total est donc un minimum). */
  partial: Set<NutrientKey>
  ingredients: IngredientNutrition[]
  /** Ingrédients pris en compte / reconnus mais sans quantité / non reconnus. */
  counted: number
  noQuantity: string[]
  unknown: string[]
}

/** Additionne les nutriments des lignes d'ingrédients et les divise par le nombre de personnes. */
export function recipeNutrition(lines: string[], servings: number, index: FoodIndex, manual?: Record<string, number | null>): RecipeNutrition {
  const totals: Totals = {}
  const partial = new Set<NutrientKey>()
  const ingredients: IngredientNutrition[] = []
  const noQuantity: string[] = []
  const unknown: string[] = []
  let counted = 0
  for (const line of lines) {
    const w = weighLine(line)
    const match = index.match(w.name || line, manual)
    ingredients.push({ ...w, match })
    if (match.how === 'ignored') continue
    if (!match.food) { unknown.push(line); continue }
    if (w.grams === null) { noQuantity.push(line); continue }
    counted++
    for (const k of NUTRIENT_KEYS) {
      const v = match.food.per100[k]
      if (v === null || v === undefined) { if (w.grams > 1) partial.add(k); continue }
      totals[k] = (totals[k] ?? 0) + (v * w.grams) / 100
    }
  }
  const n = servings > 0 ? servings : 1
  const perServing: Totals = {}
  for (const k of NUTRIENT_KEYS) if (totals[k] !== undefined) perServing[k] = totals[k]! / n
  return { perServing, partial, ingredients, counted, noQuantity, unknown }
}

// ───────────────────────── Repères pour une journée ─────────────────────────

export interface Reference {
  key: NutrientKey
  label: string
  unit: string
  /** Repère pour une journée (adulte). `max` : à ne pas dépasser (sel, saturés). */
  daily: number
  max?: boolean
}

/**
 * Repères journaliers pour un adulte (ANSES 2016-2021 et EFSA) : références nutritionnelles pour la population, ou apports satisfaisants.
 * Le fer est celui d'un homme ou d'une femme ménopausée ; une femme non ménopausée a besoin de 16 mg. Ce sont des repères, pas un avis médical.
 */
export const REFERENCES: Reference[] = [
  { key: 'kcal', label: 'Énergie', unit: 'kcal', daily: 2200 },
  { key: 'prot', label: 'Protéines', unit: 'g', daily: 65 },
  { key: 'gluc', label: 'Glucides', unit: 'g', daily: 275 },
  { key: 'sucres', label: 'dont sucres', unit: 'g', daily: 100, max: true },
  { key: 'fibres', label: 'Fibres', unit: 'g', daily: 30 },
  { key: 'lip', label: 'Lipides', unit: 'g', daily: 80 },
  { key: 'ags', label: 'dont saturés', unit: 'g', daily: 22, max: true },
  { key: 'ala', label: 'Oméga-3 (ALA)', unit: 'g', daily: 2.2 },
  { key: 'la', label: 'Oméga-6 (LA)', unit: 'g', daily: 9 },
  { key: 'sel', label: 'Sel', unit: 'g', daily: 6, max: true },
  { key: 'fe', label: 'Fer', unit: 'mg', daily: 11 },
  { key: 'zn', label: 'Zinc', unit: 'mg', daily: 11 },
  { key: 'ca', label: 'Calcium', unit: 'mg', daily: 950 },
  { key: 'mg', label: 'Magnésium', unit: 'mg', daily: 380 },
  { key: 'iode', label: 'Iode', unit: 'µg', daily: 150 },
  { key: 'vitc', label: 'Vitamine C', unit: 'mg', daily: 110 },
  { key: 'b9', label: 'Folates (B9)', unit: 'µg', daily: 330 },
  { key: 'b12', label: 'Vitamine B12', unit: 'µg', daily: 4 },
  { key: 'vitd', label: 'Vitamine D', unit: 'µg', daily: 15 },
]

/** Pourcentage du repère journalier (arrondi), ou null si la valeur est inconnue. */
export function percentOf(value: number | undefined, ref: Reference): number | null {
  return value === undefined ? null : Math.round((value / ref.daily) * 100)
}
