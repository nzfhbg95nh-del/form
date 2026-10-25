// Recettes venues de Klippr : lecture du fichier d'export et mise en forme des pages (comme une recette écrite à la main dans Form).

import { firstNumber, RECIPE, type RecipeCategory } from './recipes'
import { normalize } from './search'

export interface KlipprGroup {
  titre?: string
  lignes: string[]
}

export interface KlipprRecipe {
  titre: string
  /** Nom de la rubrique (« Plats », « Desserts »…), sans identifiant. */
  categorie?: string
  portions?: string
  temps?: string
  ingredients: KlipprGroup[]
  etapes: string[]
  notes?: string
  /** Adresse du post d'origine : sert aussi à reconnaître une recette déjà importée. */
  post?: string
  auteur?: string
  /** Photo, en « data URL ». */
  photo?: string
}

export const KLIPPR_FORMAT = 'klippr-recettes'

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : [])
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** Lit le fichier exporté par Klippr. Les recettes sans titre sont ignorées ; un fichier qui n'est pas de Klippr donne une erreur claire. */
export function parseKlipprFile(content: string): { recipes: KlipprRecipe[] } | { error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    return { error: "Ce fichier n'est pas lisible." }
  }
  const file = raw as { format?: unknown; recettes?: unknown }
  if (!file || file.format !== KLIPPR_FORMAT || !Array.isArray(file.recettes)) return { error: "Ce fichier n'a pas été exporté par Klippr." }
  const recipes: KlipprRecipe[] = []
  for (const r of file.recettes as Record<string, unknown>[]) {
    const titre = text(r?.titre)
    if (!titre) continue
    const photo = typeof r.photo === 'string' && r.photo.startsWith('data:image/') ? r.photo : undefined
    const post = text(r.post)
    recipes.push({
      titre,
      categorie: text(r.categorie),
      portions: text(r.portions),
      temps: text(r.temps),
      ingredients: Array.isArray(r.ingredients)
        ? (r.ingredients as Record<string, unknown>[]).map((g) => ({ titre: text(g?.titre), lignes: strings(g?.lignes) })).filter((g) => g.lignes.length > 0)
        : [],
      etapes: strings(r.etapes),
      notes: text(r.notes),
      post: post && /^https?:\/\//.test(post) ? post : undefined,
      auteur: text(r.auteur),
      photo,
    })
  }
  return { recipes }
}

/** Le choix de la propriété « Catégorie » qui porte ce nom (sans tenir compte des accents, de la casse ni des points de suspension). */
export function categoryIdFor(label: string | undefined, categories: RecipeCategory[]): string | undefined {
  if (!label) return undefined
  const clean = (s: string) => normalize(s).replace(/[….]+$/g, '').trim()
  const wanted = clean(label)
  return categories.find((c) => clean(c.label) === wanted)?.id
}

/** Minutes de préparation : le premier temps lu (« 20 min » → 20, « 1 h 30 » → 90, « 10 min + 2 h au frais » → 10), sinon null. */
export function prepMinutes(temps: string | undefined): number | null {
  if (!temps) return null
  const t = normalize(temps)
  const h = /(\d+)\s*h(?:eures?)?\s*(\d+)?/.exec(t)
  const m = /(\d+)\s*min/.exec(t)
  // Le premier des deux qui apparaît dans le texte.
  if (h && (!m || h.index < m.index)) return Number(h[1]) * 60 + (h[2] ? Number(h[2]) : 0)
  if (m) return Number(m[1])
  return null
}

/** Propriétés de la ligne dans la base « Recettes » : catégorie, portions de base, préparation, source. */
export function klipprValues(r: KlipprRecipe, categories: RecipeCategory[]): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  const category = categoryIdFor(r.categorie, categories)
  if (category) values[RECIPE.type] = category
  const servings = firstNumber(r.portions ?? '')
  if (servings !== null) values[RECIPE.servings] = servings
  const prep = prepMinutes(r.temps)
  if (prep !== null) values[RECIPE.prep] = prep
  if (r.post) values[RECIPE.source] = r.post
  return values
}

const h2 = (t: string) => ({ type: 'heading', props: { level: 2 }, content: t })
const bold = (t: string) => ({ type: 'paragraph', content: [{ type: 'text', text: t, styles: { bold: true } }] })

/** Contenu de la page : photo, portions, ingrédients à cocher (par groupe), étapes numérotées, notes et source. */
export function klipprBlocks(r: KlipprRecipe): unknown[] {
  const blocks: unknown[] = []
  if (r.photo) blocks.push({ type: 'image', props: { url: r.photo } })
  blocks.push({ type: 'portions', props: { servings: firstNumber(r.portions ?? '') ?? 4 } })
  blocks.push(h2('Ingrédients'))
  if (r.ingredients.length === 0) blocks.push({ type: 'checkListItem', content: '' })
  for (const g of r.ingredients) {
    if (g.titre) blocks.push(bold(g.titre))
    for (const line of g.lignes) blocks.push({ type: 'checkListItem', content: line })
  }
  blocks.push(h2('Étapes'))
  if (r.etapes.length === 0) blocks.push({ type: 'numberedListItem', content: '' })
  for (const s of r.etapes) blocks.push({ type: 'numberedListItem', content: s })
  const notes = [r.notes, r.temps ? `Temps : ${r.temps}.` : '', r.auteur ? `Recette de ${r.auteur.startsWith('@') ? r.auteur : '@' + r.auteur}.` : ''].filter(Boolean).join(' ')
  blocks.push(h2('Notes'))
  blocks.push({ type: 'paragraph', content: notes })
  return blocks
}

/** Écarte les recettes déjà dans Form (même adresse de post, ou à défaut même titre) : on n'écrase jamais ce qu'il a modifié. */
export function newKlipprRecipes(incoming: KlipprRecipe[], existing: { title: string; source?: string }[]): KlipprRecipe[] {
  const sources = new Set(existing.map((e) => e.source).filter(Boolean))
  const titles = new Set(existing.map((e) => normalize(e.title)))
  return incoming.filter((r) => (r.post ? !sources.has(r.post) : !titles.has(normalize(r.titre))))
}
