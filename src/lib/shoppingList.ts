// Liste de courses de la semaine : additionne les ingrédients des recettes planifiées (au prorata des personnes), par rayon.
// Logique pure, testée automatiquement.

import { formatNumber, parseQuantity } from './recipeScale'

// ───────────────────────── Lire les ingrédients d'une recette ─────────────────────────

interface BlockLike {
  type?: string
  props?: Record<string, unknown>
  content?: unknown
  children?: BlockLike[]
}

const LIST_TYPES = new Set(['checkListItem', 'bulletListItem', 'numberedListItem'])
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').trim()

const textOf = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return (content as { text?: string }[]).map((c) => (c && typeof c === 'object' ? c.text ?? '' : '')).join('')
}

/** Un petit groupe d'ingrédients (« Sauce », « Pour servir »…) et ses lignes. */
export interface IngredientGroup {
  label: string
  lines: string[]
}

/** Les ingrédients d'une recette : ceux de la liste « Ingrédients », et ceux de sa « Version sans viande / sans poisson » s'il y en a une. */
export function readIngredients(blocks: unknown): { main: IngredientGroup[]; variant: string[] | null; servings: number | null } {
  const main: IngredientGroup[] = []
  let variant: string[] | null = null
  let servings: number | null = null
  // mode : où l'on est dans la page.
  let mode: 'none' | 'main' | 'variant-intro' | 'variant' = 'none'
  let inVariantSection = false
  const walk = (list: BlockLike[]) => {
    for (const b of list) {
      const t = b.type ?? ''
      if (t === 'portions' && servings === null) {
        const n = Number(b.props?.servings)
        if (Number.isFinite(n) && n > 0) servings = n
      }
      if (t === 'heading') {
        const title = fold(textOf(b.content))
        const level = Number(b.props?.level ?? 1)
        if (title.startsWith('version sans')) {
          inVariantSection = true
          mode = 'variant-intro'
        } else if (inVariantSection && title.startsWith('ingredient')) {
          mode = 'variant'
          variant = variant ?? []
        } else if (inVariantSection && level >= 3) {
          mode = 'variant-intro'
        } else {
          inVariantSection = false
          mode = title.startsWith('ingredient') ? 'main' : 'none'
        }
      } else if (mode === 'main' || mode === 'variant') {
        const text = textOf(b.content).trim()
        const isList = LIST_TYPES.has(t)
        if (text) {
          if (mode === 'variant' && isList) variant!.push(text)
          else if (mode === 'main') {
            // Un paragraphe sans quantité au début est le nom d'un petit groupe (« Tzatziki », « Pour servir ») ; sinon c'est un ingrédient.
            if (!isList && !parseQuantity(text)) main.push({ label: text, lines: [] })
            else if (isList || t === 'paragraph') {
              if (main.length === 0) main.push({ label: '', lines: [] })
              main[main.length - 1].lines.push(text)
            }
          }
        }
      }
      if (b.children?.length) walk(b.children)
    }
  }
  walk((Array.isArray(blocks) ? blocks : []) as BlockLike[])
  return { main, variant, servings }
}

const STOP = new Set(['les', 'des', 'de', 'la', 'le', 'du', 'et', 'recette', 'sans', 'changement', 'pour', 'avec', 'une', 'un', 'aux', 'au'])
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w))

/**
 * Les lignes à acheter pour une recette. Avec une version sans viande, c'est elle qui compte ; une ligne comme
 * « Le tzatziki de la recette, sans changement » reprend les ingrédients du groupe correspondant de la recette d'origine.
 */
export function shoppingLines(blocks: unknown, preferVariant = true): { lines: string[]; servings: number | null; variant: boolean } {
  const { main, variant, servings } = readIngredients(blocks)
  if (!preferVariant || !variant || variant.length === 0) return { lines: main.flatMap((g) => g.lines), servings, variant: false }
  const out: string[] = []
  for (const line of variant) {
    if (/de la recette/i.test(line)) {
      const ref = words(line.replace(/de la recette.*$/i, '').concat(' ', line))
      const groups = main.filter((g) => {
        const own = words(g.label + ' ' + g.lines.join(' '))
        return ref.some((w) => own.some((o) => o.startsWith(w.slice(0, 5)) || w.startsWith(o.slice(0, 5))))
      })
      for (const g of groups) out.push(...g.lines)
      continue
    }
    out.push(line)
  }
  return { lines: out, servings, variant: true }
}

// ───────────────────────── Comprendre une ligne ─────────────────────────

/** Famille d'unité : les quantités d'une même famille s'additionnent. */
type Family = 'g' | 'ml' | 'cas' | 'cac' | 'unit' | string

const UNITS: { re: RegExp; family: Family; factor: number; label: string }[] = [
  { re: /^(kg|kilos?|kilogrammes?)(?=[\s.,]|$)\.?/i, family: 'g', factor: 1000, label: 'g' },
  { re: /^(g|gr|grammes?)(?=[\s.,]|$)\.?/i, family: 'g', factor: 1, label: 'g' },
  { re: /^(mg)(?=[\s.,]|$)/i, family: 'g', factor: 0.001, label: 'g' },
  { re: /^(l|litres?)(?=[\s.,]|$)\.?/i, family: 'ml', factor: 1000, label: 'ml' },
  { re: /^(dl)(?=[\s.,]|$)\.?/i, family: 'ml', factor: 100, label: 'ml' },
  { re: /^(cl)(?=[\s.,]|$)\.?/i, family: 'ml', factor: 10, label: 'ml' },
  { re: /^(ml)(?=[\s.,]|$)\.?/i, family: 'ml', factor: 1, label: 'ml' },
  { re: /^(c\.?\s?à\s?s(oupe)?\.?|c\.?\s?a\.?\s?s\.?|cas|cuill(?:è|e)res?\s+à\s+soupe|cs)(?=[\s.,]|$)\.?/i, family: 'cas', factor: 1, label: 'c. à soupe' },
  { re: /^(c\.?\s?à\s?c(afé)?\.?|c\.?\s?a\.?\s?c\.?|cac|cuill(?:è|e)res?\s+à\s+café|cc)(?=[\s.,]|$)\.?/i, family: 'cac', factor: 1, label: 'c. à café' },
]
const COUNT_UNITS = ['pincées?', 'gousses?', 'boîtes?', 'bocal|bocaux', 'tasses?', 'verres?', 'sachets?', 'tranches?', 'feuilles?', 'branches?', 'brins?', 'bottes?', 'poignées?', 'petites? poignées?', 'cubes?', 'paquets?', 'bâtons?', 'morceaux?', 'cm', 'pouces?', 'filets?', 'traits?', 'noix', 'pots?', 'briques?', 'bouquets?', 'têtes?', 'blocs?', 'demi-blocs?']
const COUNT_RE = new RegExp(`^(${COUNT_UNITS.join('|')})(?=[\\s.,]|$)`, 'i')

export interface ParsedLine {
  /** Quantité dans l'unité de base de sa famille (g, ml, cuillères, pièces…), ou null. */
  qty: number | null
  family: Family
  /** Unité affichée (« g », « gousse », « c. à soupe »…), vide pour des pièces (« 3 oignons »). */
  unit: string
  /** Le nom de l'ingrédient tel qu'écrit (« pois chiches cuits »). */
  name: string
  /** Clé de regroupement (« pois chiche »). */
  key: string
}

const singular = (w: string) => (w.length > 3 && /[sx]$/.test(w) && !/(ss|is|us|os|as)$/.test(w) ? w.slice(0, -1) : w)

/** La clé d'un ingrédient : en minuscules, sans accents, sans précisions entre parenthèses ni après la virgule, au singulier. */
export function ingredientKey(name: string): string {
  const base = fold(name)
    .replace(/\(.*?\)/g, ' ')
    .split(/[,;]/)[0]
    .replace(/\b(frais|fraiche|fraiches|cuits?|cuites?|egoutte(e|es|s)?|bien|hache(e|es|s)?|emince(e|es|s)?|rape(e|es|s)?|moulue?s?|en des|en cubes?|surgele(e|es|s)?|bio|gros|grosse|petite?s?|moyens?|moyennes?)\b/g, ' ')
    .replace(/^(de |d'|d’|du |des )/, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
  return base.join(' ').trim()
}

/** Comprend une ligne d'ingrédient : « 2 c. à soupe d'huile d'olive », « 480 g de pois chiches », « 3 tomates », « Sel, poivre ». */
export function parseLine(line: string): ParsedLine {
  const raw = line.replace(/\s+/g, ' ').trim()
  const q = parseQuantity(raw)
  if (!q) {
    const name = raw.replace(/^(un peu d[e']|quelques|une? (pincée|poignée|filet|trait) d[e']\s?)/i, '').trim()
    return { qty: null, family: 'none', unit: '', name, key: ingredientKey(name) }
  }
  // Une fourchette (« 2 à 3 ») : on achète le maximum.
  let qty = q.upper ?? q.value
  let rest = q.rest.trim()
  let family: Family = 'unit'
  let unit = ''
  const known = UNITS.find((u) => u.re.test(rest))
  if (known) {
    const m = known.re.exec(rest)!
    rest = rest.slice(m[0].length).trim()
    qty *= known.factor
    family = known.family
    unit = known.label
  } else {
    const m = COUNT_RE.exec(rest)
    if (m) {
      const u = m[1].toLowerCase()
      rest = rest.slice(m[0].length).trim()
      const base = u === 'bocaux' ? 'bocal' : u === 'cm' || u === 'noix' ? u : u.replace(/s$/, '')
      family = `u:${singular(fold(base))}`
      unit = base
    }
  }
  const name = rest.replace(/^(de |d'|d’|du |des )/i, '').trim()
  return { qty, family, unit, name: name || raw, key: ingredientKey(name || raw) }
}

// ───────────────────────── Rayons ─────────────────────────

export const AISLES = ['Fruits et légumes', 'Frais', 'Boulangerie', 'Épicerie', 'Épices et condiments', 'Surgelés', 'Autres'] as const
export type Aisle = (typeof AISLES)[number]

const has = (s: string, list: string[]) => list.some((w) => new RegExp(`(^|[^a-z])${w}`).test(s))

/** Le rayon d'un ingrédient (d'après des mots-clés). */
export function aisleOf(name: string): Aisle {
  const s = fold(name)
  if (has(s, ['surgele'])) return 'Surgelés'
  if (has(s, ['sel', 'poivre', 'cumin', 'curcuma', 'paprika', 'cannelle', 'garam', 'curry', 'cardamome', 'laurier', 'clou', 'girofle', 'fenouil', 'fenugrec', 'kasuri', 'amchur', 'origan', 'herbes de provence', 'muscade', 'moutarde', 'ketchup', 'mayonnaise', 'harissa', 'capre', 'zaatar', 'za\'atar', 'coriandre moulue', 'graines de coriandre', 'piment (de cayenne|du cachemire|rouge|en poudre|d\'espelette|guntur)', 'flocons de piment', 'ail en poudre', 'masala', 'sumac', 'levure', 'bicarbonate', 'vanille'])) return 'Épices et condiments'
  if (has(s, ['pain', 'pita', 'naan', 'pav', 'brioche', 'tortilla', 'wrap', 'baguette', 'galette'])) return 'Boulangerie'
  if (has(s, ['lait de coco', 'creme de coco'])) return 'Épicerie'
  if (has(s, ['lait', 'yaourt', 'creme', 'beurre', 'fromage', 'feta', 'mozzarella', 'parmesan', 'paneer', 'oeuf', 'œuf', 'tofu', 'tempeh', 'ghee', 'ricotta', 'skyr', 'mascarpone', 'emmental', 'comte', 'chevre', 'burrata', 'halloumi'])) return 'Frais'
  if (has(s, ['pate d', 'pate de'])) return 'Épicerie'
  const tomatoCan = has(s, ['concentre', 'conserve', 'concass', 'sauce tomate', 'puree de tomate', 'coulis', 'sechee', 'chair de tomate', 'bocal'])
  if (!tomatoCan && has(s, ['oignon', 'ail', 'echalote', 'tomate', 'carotte', 'pomme de terre', 'pommes de terre', 'patate', 'courgette', 'aubergine', 'poivron', 'chou', 'brocoli', 'epinard', 'salade', 'concombre', 'avocat', 'citron', 'gingembre', 'piment vert', 'jalapeno', 'champignon', 'betterave', 'persil', 'coriandre', 'menthe', 'aneth', 'ciboulette', 'basilic', 'pak', 'figue', 'pomme', 'banane', 'mangue', 'celeri', 'poireau', 'courge', 'butternut', 'potiron', 'radis', 'fenouil frais', 'roquette', 'mache', 'haricots verts', 'petits pois frais', 'fraise', 'framboise', 'orange', 'poire', 'raisin', 'herbes', 'mais'])) return 'Fruits et légumes'
  if (has(s, ['riz', 'pate', 'nouille', 'ramen', 'farine', 'semoule', 'quinoa', 'boulgour', 'lentille', 'pois chiche', 'haricot', 'flocon', 'avoine', 'panko', 'chapelure', 'sucre', 'miel', 'sirop', 'tomates concassees', 'concentre', 'sauce', 'noix', 'cajou', 'amande', 'noisette', 'pistache', 'cacahuete', 'arachide', 'graine', 'sesame', 'pignon', 'huile', 'vinaigre', 'soja', 'maggi', 'bouillon', 'cube', 'tahini', 'miso', 'maizena', 'fecule', 'chocolat', 'cacao', 'olive', 'conserve', 'boite', 'nori', 'algue', 'puree', 'coulis', 'polenta', 'couscous', 'chair de tomate', 'bocal', 'tomate'])) return 'Épicerie'
  return 'Autres'
}

// ───────────────────────── La liste ─────────────────────────

export interface ShoppingSource {
  /** Nom de la recette (pour dire d'où vient chaque article). */
  recipe: string
  lines: string[]
  /** Facteur des quantités : personnes prévues / personnes de la recette. */
  factor: number
}

export interface ShoppingItem {
  /** Identifiant stable (pour garder l'article coché d'une fois sur l'autre). */
  id: string
  text: string
  aisle: Aisle
  recipes: string[]
}

const pluralFirst = (name: string) => name.replace(/^(\S+)/, (w) => (/[sxz]$/i.test(w) ? w : w + 's'))
const elide = (name: string) => (/^[aeiouhéèêâîôûœ]/i.test(name) ? `d’${name}` : `de ${name}`)

function render(qty: number | null, family: Family, unit: string, names: string[]): string {
  const singularName = names.find((n) => !/^\S+[sx]\b/i.test(n)) ?? names[0].replace(/^(\S+?)[sx]\b/i, '$1')
  const pluralName = names.find((n) => /^\S+[sx]\b/i.test(n))
  if (qty === null) return names[0].charAt(0).toUpperCase() + names[0].slice(1)
  if (family === 'g') return qty >= 1000 ? `${formatNumber(qty / 1000)} kg ${elide(names[0])}` : `${formatNumber(qty)} g ${elide(names[0])}`
  if (family === 'ml') return qty >= 1000 ? `${formatNumber(qty / 1000)} L ${elide(names[0])}` : `${formatNumber(qty)} ml ${elide(names[0])}`
  if (family === 'unit') return qty > 1 ? `${formatNumber(qty)} ${pluralName ?? pluralFirst(singularName)}` : `${formatNumber(qty)} ${singularName}`
  const u = family === 'cas' || family === 'cac' ? unit : qty > 1 && !/[sx]$/.test(unit) && unit !== 'cm' ? pluralFirst(unit) : unit
  return `${formatNumber(qty)} ${u} ${elide(names[0])}`
}

/** Ce qu'on n'achète pas (l'eau du robinet). */
const NOT_BOUGHT = new Set(['eau', 'eau chaude', 'eau froide', 'eau tiede', 'eau bouillante', 'glacon'])

/** « Sel et poivre », « Sel, poivre » (sans quantité) : deux articles. Une ligne avec une quantité reste entière. */
export function splitPlain(line: string): string[] {
  if (parseQuantity(line)) return [line]
  const parts = line.split(/\s*,\s*|\s+et\s+/i).map((x) => x.trim()).filter(Boolean)
  return parts.length > 1 && parts.every((x) => x.split(/\s+/).length <= 4) ? parts : [line]
}

/** Additionne les ingrédients de plusieurs recettes (déjà mis au bon nombre de personnes par `factor`), puis les range par rayon. */
export function buildShoppingList(sources: ShoppingSource[]): ShoppingItem[] {
  interface Acc { key: string; family: Family; unit: string; qty: number | null; names: string[]; recipes: Set<string> }
  const acc = new Map<string, Acc>()
  for (const src of sources) {
    for (const line of src.lines.flatMap(splitPlain)) {
      const p = parseLine(line)
      if (!p.key || NOT_BOUGHT.has(p.key)) continue
      const id = `${p.key}|${p.family}`
      const cur = acc.get(id) ?? { key: p.key, family: p.family, unit: p.unit, qty: p.qty === null ? null : 0, names: [], recipes: new Set<string>() }
      if (p.qty !== null) cur.qty = (cur.qty ?? 0) + p.qty * src.factor
      if (!cur.names.includes(p.name)) cur.names.push(p.name)
      cur.recipes.add(src.recipe)
      acc.set(id, cur)
    }
  }
  // Un ingrédient sans quantité (« Huile d'olive ») disparaît s'il est déjà acheté avec une quantité ; ses recettes rejoignent cette ligne.
  const withQty = new Map<string, Acc>()
  for (const a of acc.values()) if (a.qty !== null && !withQty.has(a.key)) withQty.set(a.key, a)
  // D'abord les fusions (pour que chaque ligne connaisse toutes ses recettes), ensuite le texte.
  const kept: Acc[] = []
  for (const a of acc.values()) {
    if (a.qty === null && withQty.has(a.key)) a.recipes.forEach((r) => withQty.get(a.key)!.recipes.add(r))
    else kept.push(a)
  }
  const items: ShoppingItem[] = kept.map((a) => {
    // Grammes et millilitres arrondis ; les pièces (gousses, oignons, bâtons…) arrondies à l'unité au-dessus ; les cuillères au quart.
    const qty = a.qty === null ? null : a.family === 'g' || a.family === 'ml' ? Math.round(a.qty) : a.family === 'cas' || a.family === 'cac' ? Math.ceil(a.qty * 4) / 4 : Math.ceil(a.qty - 1e-9)
    return { id: `${a.key}|${a.family}`, text: render(qty, a.family, a.unit, a.names), aisle: aisleOf(a.names[0]), recipes: [...a.recipes] }
  })
  const order = (x: ShoppingItem) => AISLES.indexOf(x.aisle)
  return items.sort((x, y) => order(x) - order(y) || x.id.localeCompare(y.id, 'fr'))
}

/** Le texte de la liste (à coller dans une note ou un message), les articles cochés en moins. */
export function shoppingText(items: ShoppingItem[], checked: Set<string>, extra: { text: string }[] = []): string {
  const out: string[] = []
  for (const aisle of AISLES) {
    const list = items.filter((i) => i.aisle === aisle && !checked.has(i.id))
    if (list.length === 0) continue
    out.push(aisle, ...list.map((i) => `- ${i.text}`), '')
  }
  if (extra.length > 0) out.push('En plus', ...extra.map((e) => `- ${e.text}`), '')
  return out.join('\n').trim()
}

// ───────────────────────── Ce qui est coché, ce qui est ajouté à la main ─────────────────────────

export const SHOPPING_SETTING = 'shopping_lists'

export interface WeekShopping {
  checked: string[]
  extra: { id: string; text: string; done?: boolean }[]
}

export function parseShopping(raw: string | null | undefined): Record<string, WeekShopping> {
  try {
    const data = raw ? JSON.parse(raw) : null
    if (!data || typeof data !== 'object') return {}
    const out: Record<string, WeekShopping> = {}
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      const w = v as Partial<WeekShopping>
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !w || typeof w !== 'object') continue
      out[k] = {
        checked: Array.isArray(w.checked) ? w.checked.filter((x): x is string => typeof x === 'string') : [],
        extra: Array.isArray(w.extra) ? w.extra.filter((e) => e && typeof e.id === 'string' && typeof e.text === 'string').map((e) => ({ id: e.id, text: e.text, done: !!e.done })) : [],
      }
    }
    return out
  } catch {
    return {}
  }
}
