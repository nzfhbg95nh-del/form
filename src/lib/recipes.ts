import { newId, OPTION_COLORS, type Schema, type SelectOption } from './database'
import type { Recipe } from './ai'

/** Identifiants des colonnes de la base « Recettes ». */
export const RECIPE = {
  type: 'type',
  prep: 'prep',
  cook: 'cook',
  servings: 'servings',
  rating: 'rating',
  tags: 'tags',
  source: 'source',
} as const

const opt = (id: string, label: string, color: string, emoji?: string) => ({ id, label, color, ...(emoji ? { emoji } : {}) })

/** Les catégories de départ (comme dans l'ancien Notion de Victor). On peut en ajouter, renommer, supprimer. */
export const DEFAULT_CATEGORIES = [
  { id: 'boissons', label: 'Boissons & Cocktails', emoji: '🥃', color: '#d3e5ef' },
  { id: 'plats', label: 'Plats', emoji: '🥘', color: '#fadec9' },
  { id: 'midi', label: 'Petit plat du midi', emoji: '🫕', color: '#fdecc8' },
  { id: 'complements', label: 'Compléments', emoji: '🥖', color: '#e8deee' },
  { id: 'desserts', label: 'Desserts', emoji: '🍩', color: '#f5e0e9' },
  { id: 'entrees', label: 'Entrée', emoji: '🥣', color: '#dbeddb' },
  { id: 'biscuits', label: 'Biscuits, etc…', emoji: '🍪', color: '#ede0d4' },
]

export const CATEGORY_FALLBACK_EMOJI = '🍽️'

/** La base « Recettes » : les catégories (choix de la propriété « Catégorie »), une galerie, et les infos d'une recette. */
export function recipesSchema(): Schema {
  return {
    kind: 'recipes',
    columns: [
      {
        id: RECIPE.type, name: 'Catégorie', type: 'select',
        options: DEFAULT_CATEGORIES.map((c) => opt(c.id, c.label, c.color, c.emoji)),
      },
      { id: RECIPE.prep, name: 'Préparation (min)', type: 'number' },
      { id: RECIPE.cook, name: 'Cuisson (min)', type: 'number' },
      { id: RECIPE.servings, name: 'Portions', type: 'number' },
      {
        id: RECIPE.rating, name: 'Note', type: 'select',
        options: [opt('1', '★', '#e3e2e0'), opt('2', '★★', '#e3e2e0'), opt('3', '★★★', '#fdecc8'), opt('4', '★★★★', '#fadec9'), opt('5', '★★★★★', '#dbeddb')],
      },
      {
        id: RECIPE.tags, name: 'Étiquettes', type: 'multiselect',
        options: [opt('veg', 'Végétarien', '#dbeddb'), opt('rapide', 'Rapide', '#d3e5ef'), opt('fetes', 'Fêtes', '#f5e0e9'), opt('economique', 'Économique', '#fdecc8')],
      },
      { id: RECIPE.source, name: 'Source', type: 'url' },
    ],
    views: [{ id: newId(), name: 'Galerie', type: 'gallery', filters: [], sorts: [] }],
  }
}

export interface RecipeCategory {
  id: string
  label: string
  emoji: string
  color: string
}

const typeColumn = (schema: Schema) => schema.columns.find((c) => c.id === RECIPE.type)

/** Les catégories de la base : un emoji est toujours fourni (celui de départ, sinon une assiette). */
export function recipeCategories(schema: Schema): RecipeCategory[] {
  const known = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c.emoji]))
  return (typeColumn(schema)?.options ?? []).map((o) => ({ id: o.id, label: o.label, color: o.color, emoji: o.emoji ?? known.get(o.id) ?? CATEGORY_FALLBACK_EMOJI }))
}

function patchCategories(schema: Schema, change: (options: SelectOption[]) => SelectOption[]): Schema {
  return { ...schema, columns: schema.columns.map((c) => (c.id === RECIPE.type ? { ...c, options: change(c.options ?? []) } : c)) }
}

export function addCategory(schema: Schema, label: string, emoji = CATEGORY_FALLBACK_EMOJI): Schema {
  const name = label.trim()
  if (!name) return schema
  return patchCategories(schema, (options) => [...options, { id: newId(), label: name, emoji, color: OPTION_COLORS[options.length % OPTION_COLORS.length] }])
}

export function renameCategory(schema: Schema, id: string, label: string): Schema {
  const name = label.trim()
  if (!name) return schema
  return patchCategories(schema, (options) => options.map((o) => (o.id === id ? { ...o, label: name } : o)))
}

export function setCategoryEmoji(schema: Schema, id: string, emoji: string): Schema {
  return patchCategories(schema, (options) => options.map((o) => (o.id === id ? { ...o, emoji: emoji || CATEGORY_FALLBACK_EMOJI } : o)))
}

/** Supprime une catégorie : ses recettes ne sont pas supprimées, elles passent dans « Sans catégorie ». */
export function removeCategory(schema: Schema, id: string): Schema {
  return patchCategories(schema, (options) => options.filter((o) => o.id !== id))
}

/** Répartit des recettes par catégorie (`none` : sans catégorie, ou dont la catégorie a été supprimée). */
export function groupByCategory<T extends { properties: string }>(rows: T[], categories: RecipeCategory[], valueOf: (row: T) => unknown): { byCategory: Map<string, T[]>; none: T[] } {
  const ids = new Set(categories.map((c) => c.id))
  const byCategory = new Map<string, T[]>(categories.map((c) => [c.id, []]))
  const none: T[] = []
  for (const row of rows) {
    const v = valueOf(row)
    if (typeof v === 'string' && ids.has(v)) byCategory.get(v)!.push(row)
    else none.push(row)
  }
  return { byCategory, none }
}

const h = (text: string) => ({ type: 'heading', props: { level: 2 }, content: text })
const p = (text = '') => ({ type: 'paragraph', content: text })

/** Contenu d'une nouvelle recette vide : photo (à ajouter toi-même), nombre de personnes, ingrédients à cocher, étapes numérotées, notes. */
export function emptyRecipeBlocks(people = 4): unknown[] {
  return [
    { type: 'image' },
    { type: 'portions', props: { servings: people } },
    h('Ingrédients'),
    { type: 'checkListItem', content: '' }, { type: 'checkListItem', content: '' }, { type: 'checkListItem', content: '' },
    h('Étapes'),
    { type: 'numberedListItem', content: '' }, { type: 'numberedListItem', content: '' }, { type: 'numberedListItem', content: '' },
    h('Notes'),
    p(),
  ]
}

/** Contenu d'une recette lue par l'assistant (les durées et les portions vont dans les propriétés). */
export function recipeBodyBlocks(r: Recipe): unknown[] {
  return [
    { type: 'portions', props: { servings: firstNumber(r.servings) ?? 4 } },
    h('Ingrédients'),
    ...(r.ingredients.length ? r.ingredients.map((i) => ({ type: 'checkListItem', content: i })) : [{ type: 'checkListItem', content: '' }]),
    h('Étapes'),
    ...(r.steps.length ? r.steps.map((s) => ({ type: 'numberedListItem', content: s })) : [{ type: 'numberedListItem', content: '' }]),
    h('Notes'),
    p(r.notes),
  ]
}

/** Premier nombre d'un texte (« 4 personnes » → 4, « 2 à 3 parts » → 2), sinon null. */
export function firstNumber(text: string): number | null {
  const m = /\d+(?:[.,]\d+)?/.exec(text)
  if (!m) return null
  const n = Number(m[0].replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Valeurs de propriétés d'une recette lue par l'assistant. */
export function recipeValues(r: Recipe): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  if (r.prepMinutes) values[RECIPE.prep] = r.prepMinutes
  if (r.cookMinutes) values[RECIPE.cook] = r.cookMinutes
  const servings = firstNumber(r.servings)
  if (servings !== null) values[RECIPE.servings] = servings
  return values
}

/** Ce qu'insère la commande « / » Recette : nom (si la page n'a pas encore de titre), durées, photo, personnes, ingrédients, étapes, notes. */
export function recipeSlashBlocks(options: { people?: number; withName?: boolean } = {}): unknown[] {
  return [
    ...(options.withName ? [{ type: 'heading', props: { level: 1 }, content: '' }] : []),
    p('Préparation : … min   ·   Cuisson : … min'),
    ...emptyRecipeBlocks(options.people ?? 4),
  ]
}
