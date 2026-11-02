/**
 * Conversion des quantités d'une recette en unités de poids ou de volume (g, kg, ml, l).
 * « 0,52 bloc de feta » -> « 105 g de feta » ; « 1 c. à soupe d'huile » -> « 15 ml d'huile » ; « 1 c. à café de cannelle » -> « 2,5 g de cannelle ».
 * Les équivalences viennent d'un tableau de texte que Victor peut corriger (une ligne : « mot = valeur »).
 * Rien n'est inventé : un ingrédient absent du tableau reste tel quel et est signalé « à compléter ».
 */
import { parseQuantity } from './recipeScale'

// ───────────────────────── Tableau d'équivalences ─────────────────────────

/** Valeurs de départ. Format : `ingrédient = valeur` avec `110 g` (une pièce), `400 ml` (un contenant), `0,55 g/ml` (poudre ou pâte mesurée à la cuillère ou au verre), `liquide` ou `garder`. */
export const DEFAULT_EQUIVALENCES = `# Une ligne = « ce qu'on lit dans la recette = la valeur ». Les lignes qui commencent par # sont des notes.
# 110 g          : une pièce pèse 110 g (oignon, boîte de pois chiches...)
# 400 ml         : un contenant contient 400 ml
# 0,55 g/ml      : poids d'un millilitre (sert pour cuillères, verres et tasses de poudres ou de pâtes)
# liquide        : se mesure en ml (cuillères, verres et tasses deviennent des ml)
# garder         : on laisse la quantité comme elle est écrite (œufs, gousses d'ail...)

# --- Liquides
eau = liquide
lait = liquide
huile = liquide
vinaigre = liquide
sauce soja = liquide
jus = liquide
bouillon = liquide
crème liquide = liquide
vin = liquide
rhum = liquide
sirop = liquide
eau de fleur d'oranger = liquide

# --- Poudres, pâtes et autres (poids d'un millilitre)
farine = 0,55 g/ml
maïzena = 0,6 g/ml
sucre = 0,85 g/ml
sucre glace = 0,55 g/ml
cassonade = 0,8 g/ml
sel = 1,2 g/ml
poivre = 0,45 g/ml
cannelle = 0,5 g/ml
cumin = 0,45 g/ml
paprika = 0,5 g/ml
curcuma = 0,6 g/ml
gingembre = 0,4 g/ml
cacao = 0,5 g/ml
levure chimique = 0,9 g/ml
bicarbonate = 1,1 g/ml
miel = 1,4 g/ml
confiture = 1,3 g/ml
moutarde = 1 g/ml
concentré de tomate = 1,1 g/ml
pâte de poivron = 1 g/ml
tahini = 1 g/ml
harissa = 1 g/ml
beurre = 0,95 g/ml
yaourt = 1 g/ml
crème fraîche = 1 g/ml
parmesan = 0,4 g/ml
fromage râpé = 0,4 g/ml
semoule = 0,7 g/ml
riz = 0,8 g/ml
graines de sésame = 0,6 g/ml
noix de coco râpée = 0,35 g/ml
amandes en poudre = 0,4 g/ml
beurre de cacahuète = 1,1 g/ml
curry = 0,45 g/ml
garam masala = 0,45 g/ml
sumac = 0,45 g/ml
piment en poudre = 0,45 g/ml
flocons de piment = 0,3 g/ml
coriandre en poudre = 0,4 g/ml
herbes de Provence = 0,2 g/ml
mélasse de grenade = 1,4 g/ml
mayonnaise = 0,95 g/ml
ketchup = 1,1 g/ml
crème épaisse = 1 g/ml
pâte de piment = 1 g/ml
chapelure = 0,4 g/ml
extrait de vanille = liquide
arôme de vanille = liquide
sauce de poisson = liquide

# --- Pièces (poids d'une pièce ou d'un contenant)
oignon = 110 g
oignon vert = 15 g
échalote = 30 g
tomate = 120 g
carotte = 80 g
pomme de terre = 150 g
patate douce = 250 g
courgette = 250 g
aubergine = 300 g
poivron = 160 g
concombre = 300 g
champignon = 20 g
pomme = 150 g
poire = 160 g
banane = 120 g
avocat = 150 g
boîte de pois chiches = 240 g
boîte de haricots rouges = 250 g
boîte de tomates concassées = 400 g
boîte de maïs = 285 g
boîte de lait de coco = 400 ml
brique de crème = 200 ml
bloc de feta = 200 g
pot de yaourt = 125 g
sachet de levure = 11 g
sachet de sucre vanillé = 7,5 g

# --- À laisser tel quel
œuf = garder
gousse d'ail = garder
ail = garder
citron = garder
lime = garder
pincée = garder
feuille = garder
branche = garder
brin = garder
bouquet = garder
botte = garder
tranche = garder
poignée = garder
`

export type EquivalenceValue =
  | { kind: 'piece'; amount: number; unit: 'g' | 'ml' }
  | { kind: 'density'; gPerMl: number }
  | { kind: 'liquid' }
  | { kind: 'keep' }

export interface Equivalence {
  /** Le mot-clé tel qu'écrit dans le tableau. */
  label: string
  tokens: string[]
  value: EquivalenceValue
}

export interface EquivalenceTable {
  entries: Equivalence[]
  /** Lignes du tableau qu'on n'a pas comprises (affichées à Victor, ignorées). */
  errors: string[]
}

const toNumber = (s: string) => Number(s.replace(',', '.'))

/** Minuscules, sans accents, « œ » -> « oe », apostrophes droites. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`]/g, "'")
}

/** Découpe en mots simplifiés (pluriel retiré), pour que « pois chiches » et « pois chiche » se retrouvent. */
function tokensOf(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w))
}

function parseValue(raw: string): EquivalenceValue | null {
  const v = normalize(raw).trim()
  if (v === 'garder') return { kind: 'keep' }
  if (v === 'liquide') return { kind: 'liquid' }
  let m = /^([\d.,]+)\s*g\s*\/\s*ml$/.exec(v)
  if (m) {
    const n = toNumber(m[1])
    return Number.isFinite(n) && n > 0 ? { kind: 'density', gPerMl: n } : null
  }
  m = /^([\d.,]+)\s*(g|ml)$/.exec(v)
  if (m) {
    const n = toNumber(m[1])
    return Number.isFinite(n) && n > 0 ? { kind: 'piece', amount: n, unit: m[2] as 'g' | 'ml' } : null
  }
  return null
}

/** Lit le tableau de texte. Les lignes illisibles sont rapportées dans `errors` et ignorées. */
export function parseEquivalences(text: string): EquivalenceTable {
  const entries: Equivalence[] = []
  const errors: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const i = line.lastIndexOf('=')
    const label = i > 0 ? line.slice(0, i).trim() : ''
    const value = i > 0 ? parseValue(line.slice(i + 1)) : null
    const tokens = tokensOf(label)
    if (!value || tokens.length === 0) {
      errors.push(line)
      continue
    }
    // Une ligne plus bas dans le tableau remplace une ligne plus haut portant le même mot.
    const key = tokens.join(' ')
    const dup = entries.findIndex((e) => e.tokens.join(' ') === key)
    if (dup >= 0) entries.splice(dup, 1)
    entries.push({ label, tokens, value })
  }
  return { entries, errors }
}

/** L'entrée la plus précise (la plus longue) dont tous les mots se suivent dans le texte. */
function findEntry(table: EquivalenceTable, tokens: string[]): Equivalence | null {
  let best: Equivalence | null = null
  for (const e of table.entries) {
    const n = e.tokens.length
    for (let i = 0; i + n <= tokens.length; i++) {
      if (e.tokens.every((t, k) => tokens[i + k] === t)) {
        if (!best || n > best.tokens.length) best = e
        break
      }
    }
  }
  return best
}

// ───────────────────────── Unités reconnues ─────────────────────────

const METRIC = /^(\s*)(kg|mg|g|gr|grammes?|ml|millilitres?|cl|dl|l|litres?)(?![a-zà-ÿ])\.?/i
const SIZE = String.raw`(?:(?:grosses?|gros|petites?|petit|grandes?|grand|belles?|beau|bonnes?|bon|rases?|bombées?|généreuses?|moyennes?|moyen)\s+)*`
const SPOON = new RegExp(
  String.raw`^\s*${SIZE}(?:c\.?\s*à\.?\s*(?:café|soupe|dessert|c|s)|cuill?[eè]res?\s+à\s+(?:café|soupe|dessert)|càc|cac|càs|cas)(?![a-zà-ÿ])\.?\s*(?:de\s+|d')?`,
  'i',
)
const MEASURE = new RegExp(String.raw`^\s*${SIZE}(verres?|tasses?|bols?|mugs?)\s*(?:de\s+|d')?`, 'i')
const CONTAINER = new RegExp(
  String.raw`^\s*${SIZE}(boîtes?|boites?|blocs?|briques?|sachets?|pots?|paquets?|bouteilles?|tablettes?|barquettes?|bocaux?|bocal|conserves?|bottes?|bouquets?|têtes?|tetes?|filets?|tranches?|morceaux?|gousses?|feuilles?|branches?|brins?|pincées?|poignées?)\s+(?:de\s+|d')`,
  'i',
)

const SIZE_LEAD = /^\s*(petites?|petit|grosses?|gros|grandes?|grand)\s+/i
/** Un poids ou un volume déjà écrit dans la recette : « (265 g) », « (environ 80 g) ». */
const WEIGHT_NOTE = /\(\s*(?:environ|env\.?|~|soit)?\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\s*\)/i

const MEASURE_ML: Record<string, number> = { verre: 200, tasse: 240, bol: 300, mug: 250 }

/** Volume d'une cuillère d'après ce qui a été reconnu : à café 5 ml, à dessert 10 ml, à soupe 15 ml. */
function spoonMl(matched: string): number {
  const t = normalize(matched)
  if (/soupe|cas\b|c\.?\s*a\.?\s*s\b/.test(t)) return 15
  if (/dessert/.test(t)) return 10
  return 5
}

// ───────────────────────── Mise en forme ─────────────────────────

/** Arrondi lisible : au demi près sous 10, à l'unité sous 50, à 5 près sous 1000, à 10 près au-delà. */
function roundAmount(v: number): number {
  if (v < 10) return Math.round(v * 2) / 2
  if (v < 50) return Math.round(v)
  if (v < 1000) return Math.round(v / 5) * 5
  return Math.round(v / 10) * 10
}

const fr = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

/** Écrit une quantité ou une fourchette avec une seule unité : « 105 g », « 220 à 330 g », « 1,5 kg ». `round` : arrondi lisible (sinon valeur exacte). */
function render(lead: string, lo: number, hi: number | undefined, base: 'g' | 'ml', joiner: string | undefined, round: boolean): string {
  const f = round ? roundAmount : (v: number) => v
  const a = f(lo)
  const b = hi === undefined ? undefined : f(hi)
  const big = (b ?? a) >= 1000
  const div = big ? 1000 : 1
  const unit = big ? (base === 'g' ? 'kg' : 'l') : base
  return `${lead}${fr(a / div)}${b !== undefined ? `${joiner ?? ' à '}${fr(b / div)}` : ''} ${unit}`
}

/** Ce qui précède une remarque entre parenthèses ou après une virgule : c'est lui qui nomme l'ingrédient. */
const noteless = (s: string) => s.split(/[(,]/)[0].trim()

/** « de farine », « d'huile », « de haricots » : avec l'apostrophe devant une voyelle ou un h muet. */
function withDe(ingredient: string): string {
  const t = ingredient.trim().replace(/^de\s+|^d['’]/i, '')
  const n = normalize(t)
  return /^[aeiouy]/.test(n) || (/^h/.test(n) && !/^h(aricot|ache|arissa)/.test(n)) ? `d'${t}` : `de ${t}`
}

// ───────────────────────── Conversion d'une ligne ─────────────────────────

export type ConvertStatus = 'converted' | 'unchanged' | 'unknown'

export interface ConvertResult {
  status: ConvertStatus
  text: string
  /** Pour « unknown » : ce qu'il faut ajouter au tableau (ex. « cannelle »). */
  missing?: string
}

const unchanged = (line: string): ConvertResult => ({ status: 'unchanged', text: line })

/** Quantités d'une ligne métrique déjà écrite en g, kg, ml, l : on ne fait que normaliser l'unité (cl -> ml, 1000 g -> 1 kg), sans arrondir. */
function convertMetric(line: string, q: NonNullable<ReturnType<typeof parseQuantity>>, m: RegExpExecArray, rest: string): ConvertResult {
  const u = m[2].toLowerCase()
  const kind = /^(kg|g|gr|gramme|grammes|mg)$/.test(u) ? 'g' : 'ml'
  const factor = { kg: 1000, mg: 0.001, g: 1, gr: 1, gramme: 1, grammes: 1, ml: 1, millilitre: 1, millilitres: 1, cl: 10, dl: 100, l: 1000, litre: 1000, litres: 1000 }[u] ?? 1
  const toBase = (v: number) => v * factor
  const maxBase = toBase(q.upper ?? q.value)
  const unit = kind === 'g' ? (maxBase >= 1000 ? 'kg' : 'g') : maxBase >= 1000 || u === 'l' || u.startsWith('litre') ? 'l' : 'ml'
  const div = unit === 'kg' || unit === 'l' ? 1000 : 1
  const num = (v: number) => fr(toBase(v) / div)
  const first = num(q.value)
  const second = q.upper !== undefined ? `${q.joiner ?? ' à '}${num(q.upper)}` : ''
  const text = `${q.lead}${first}${second} ${unit}${rest}`
  return text === line ? unchanged(line) : { status: 'converted', text }
}

export function convertLine(line: string, table: EquivalenceTable): ConvertResult {
  const q = parseQuantity(line)
  if (!q) return unchanged(line)
  const rest = q.rest

  const metric = METRIC.exec(rest)
  if (metric) return convertMetric(line, q, metric, rest.slice(metric[0].length))

  // Cuillère, verre, tasse : un volume, qui devient des ml (liquide) ou des g (poudre ou pâte connue).
  const spoon = SPOON.exec(rest)
  const measure = spoon ? null : MEASURE.exec(rest)
  const m = spoon ?? measure
  if (m) {
    const ml = spoon ? spoonMl(spoon[0]) : MEASURE_ML[measure![1].toLowerCase().replace(/s$/, '')]
    const ingredient = rest.slice(m[0].length)
    if (ingredient.trim() === '') return unchanged(line)
    // Seul le nom de l'ingrédient compte, pas une remarque (« (la pâte de poivron est déjà salée) »).
    const entry = findEntry(table, tokensOf(noteless(ingredient)))
    if (!entry) return { status: 'unknown', text: line, missing: noteless(ingredient) }
    if (entry.value.kind === 'keep') return unchanged(line)
    const factor = entry.value.kind === 'liquid' ? 1 : entry.value.kind === 'density' ? entry.value.gPerMl : null
    if (factor === null) return { status: 'unknown', text: line, missing: noteless(ingredient) }
    const hi = q.upper === undefined ? undefined : q.upper * ml * factor
    return { status: 'converted', text: `${render(q.lead, q.value * ml * factor, hi, entry.value.kind === 'liquid' ? 'ml' : 'g', q.joiner, true)} ${withDe(ingredient)}` }
  }

  // Pièces et contenants : « 1,5 oignon », « 3 boîtes de pois chiches », « 0,5 bloc de feta ».
  const container = CONTAINER.exec(rest)
  let ingredient = container ? rest.slice(container[0].length) : rest
  // « petit » et « gros » ajustent le poids d'une pièce (sans contenant).
  let sizeFactor = 1
  if (!container) {
    const size = SIZE_LEAD.exec(ingredient)
    if (size) {
      sizeFactor = /^petit/i.test(size[1]) ? 0.7 : 1.3
      ingredient = ingredient.slice(size[0].length)
    }
  }
  const name = noteless(ingredient)
  // Un contenant (boîte, bloc, pincée...) n'est converti que si le tableau parle de ce contenant : on ne cherche que parmi ces lignes.
  const word = container ? tokensOf(container[1])[0] : null
  const candidates = word ? { ...table, entries: table.entries.filter((e) => e.tokens.includes(word)) } : table
  const entry = findEntry(candidates, tokensOf(container ? noteless(rest) : name))
  if (entry?.value.kind === 'keep') return unchanged(line)

  // Un poids écrit dans la recette passe avant le tableau : « 1 boîte de pois chiches (265 g) » -> « 265 g de pois chiches ».
  const written = q.upper === undefined ? WEIGHT_NOTE.exec(rest) : null
  if (written) {
    const base = /^(kg|g)$/i.test(written[2]) ? 'g' : 'ml'
    const per = toNumber(written[1]) * ({ kg: 1000, g: 1, ml: 1, cl: 10, l: 1000 }[written[2].toLowerCase()] ?? 1)
    const without = ingredient.replace(written[0], '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1')
    return { status: 'converted', text: `${render(q.lead, q.value * per, undefined, base, undefined, false)} ${withDe(without)}` }
  }

  // Aucune équivalence : on signale l'ingrédient pour que Victor l'ajoute au tableau ; une ligne sans nom reste telle quelle.
  if (!entry) return name === '' ? unchanged(line) : { status: 'unknown', text: line, missing: name }
  if (entry.value.kind !== 'piece') return { status: 'unknown', text: line, missing: name }
  const each = entry.value.amount * sizeFactor
  const hi = q.upper === undefined ? undefined : q.upper * each
  return { status: 'converted', text: `${render(q.lead, q.value * each, hi, entry.value.unit, q.joiner, true)} ${withDe(ingredient)}` }
}

// ───────────────────────── Aperçu d'une recette ─────────────────────────

export interface IngredientPreview {
  id: string
  before: string
  after: string
}

export interface RecipePreview {
  changes: IngredientPreview[]
  /** Ingrédients absents du tableau (sans doublon), à ajouter si Victor le souhaite. */
  missing: string[]
}

/** Calcule ce qui changerait, sans rien modifier. `lines` vient de `extractIngredients`. */
export function previewConversion(lines: { id: string; text: string }[], table: EquivalenceTable): RecipePreview {
  const changes: IngredientPreview[] = []
  const missing: string[] = []
  for (const l of lines) {
    const r = convertLine(l.text, table)
    if (r.status === 'converted' && r.text !== l.text) changes.push({ id: l.id, before: l.text, after: r.text })
    else if (r.status === 'unknown' && r.missing && !missing.includes(r.missing)) missing.push(r.missing)
  }
  return { changes, missing }
}
