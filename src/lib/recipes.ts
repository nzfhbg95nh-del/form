import { newId, OPTION_COLORS, parseValues, type Column, type Schema, type SelectOption } from './database'
import type { Recipe } from './ai'

/** Identifiants des colonnes de la base « Recettes ». */
export const RECIPE = {
  type: 'type',
  prep: 'prep',
  cook: 'cook',
  servings: 'servings',
  rating: 'rating',
  tags: 'tags',
  difficulty: 'difficulty',
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

/**
 * La base « Recettes » : les catégories (choix de la propriété « Catégorie »), une galerie, et deux autres propriétés :
 * « Portions de base », le nombre de personnes pour lequel la recette est écrite (le choix « Pour N personnes » s'adapte à partir de là),
 * et « Source » (le lien de la recette).
 */
export function recipesSchema(): Schema {
  return {
    kind: 'recipes',
    columns: [
      {
        id: RECIPE.type, name: 'Catégorie', type: 'select',
        options: DEFAULT_CATEGORIES.map((c) => opt(c.id, c.label, c.color, c.emoji)),
      },
      { id: RECIPE.servings, name: 'Portions de base', type: 'number' },
      ratingColumn(),
      prepColumn(),
      difficultyColumn(),
      { id: RECIPE.source, name: 'Source', type: 'url' },
    ],
    views: [{ id: newId(), name: 'Galerie', type: 'gallery', filters: [], sorts: [] }],
  }
}

const STAR_COLORS = ['#e3e2e0', '#fadec9', '#fdecc8', '#dbeddb', '#d3e5ef']
const ratingColumn = (): Column => ({
  id: RECIPE.rating, name: 'Note', type: 'select',
  options: [1, 2, 3, 4, 5].map((n) => opt(`r${n}`, '★'.repeat(n), STAR_COLORS[n - 1])),
})
const prepColumn = (): Column => ({ id: RECIPE.prep, name: 'Préparation (min)', type: 'number' })
const difficultyColumn = (): Column => ({
  id: RECIPE.difficulty, name: 'Difficulté', type: 'select',
  options: [opt('d1', 'Facile', '#dbeddb'), opt('d2', 'Moyen', '#fdecc8'), opt('d3', 'Difficile', '#ffe2dd')],
})

/** Propriétés abandonnées (cuisson, étiquettes) : retirées. La note, le temps de préparation et la difficulté servent au tri. */
const REMOVED_COLUMNS = new Set<string>([RECIPE.cook, RECIPE.tags])
const COLUMN_ORDER: string[] = [RECIPE.type, RECIPE.servings, RECIPE.rating, RECIPE.prep, RECIPE.difficulty, RECIPE.source]

/**
 * Met une base « Recettes » créée avant au goût du jour : retire les propriétés abandonnées, ajoute celles qui manquent
 * (note, préparation, difficulté, source) et les range dans l'ordre. Renvoie le même schéma s'il n'y a rien à changer.
 */
export function normalizeRecipesSchema(schema: Schema): Schema {
  const has = (id: string) => schema.columns.some((c) => c.id === id)
  const missing: Column[] = []
  if (!has(RECIPE.rating)) missing.push(ratingColumn())
  if (!has(RECIPE.prep)) missing.push(prepColumn())
  if (!has(RECIPE.difficulty)) missing.push(difficultyColumn())
  if (!has(RECIPE.source)) missing.push({ id: RECIPE.source, name: 'Source', type: 'url' })
  const hasRemoved = schema.columns.some((c) => REMOVED_COLUMNS.has(c.id))
  if (!hasRemoved && missing.length === 0) return schema
  const rank = (id: string) => { const i = COLUMN_ORDER.indexOf(id); return i < 0 ? COLUMN_ORDER.length : i }
  const columns = [...schema.columns.filter((c) => !REMOVED_COLUMNS.has(c.id)).map((c) => (c.id === RECIPE.servings ? { ...c, name: 'Portions de base' } : c)), ...missing]
    .sort((x, y) => rank(x.id) - rank(y.id))
  return { ...schema, columns }
}

export type RecipeSort = 'name' | 'rating' | 'prep' | 'difficulty'
export const RECIPE_SORTS: { id: RecipeSort; label: string }[] = [
  { id: 'name', label: 'Nom' },
  { id: 'rating', label: 'Note' },
  { id: 'prep', label: 'Temps de préparation' },
  { id: 'difficulty', label: 'Difficulté' },
]

/** Sens de départ quand on choisit un tri : la note se lit du meilleur au moins bon, le reste du plus petit au plus grand. */
export const defaultSortDescending = (sort: RecipeSort) => sort === 'rating'

/** Trie des recettes ; celles qui n'ont pas la valeur demandée passent à la fin. Le nom départage les égalités. */
export function sortRecipes<T extends { title: string | null; properties: string | null }>(rows: T[], sort: RecipeSort, nameOf: (r: T) => string, descending = false): T[] {
  const num = (r: T): number | null => {
    const v = parseValues(r.properties as string)
    if (sort === 'rating') { const m = /^r([1-5])$/.exec(String(v[RECIPE.rating] ?? '')); return m ? Number(m[1]) : null }
    if (sort === 'difficulty') { const m = /^d([1-3])$/.exec(String(v[RECIPE.difficulty] ?? '')); return m ? Number(m[1]) : null }
    if (sort === 'prep') { const n = Number(v[RECIPE.prep]); return v[RECIPE.prep] === undefined || v[RECIPE.prep] === '' || !Number.isFinite(n) ? null : n }
    return 0
  }
  return [...rows].sort((x, y) => {
    const a = num(x), b = num(y)
    const sign = descending ? -1 : 1
    if (a !== b) { if (a === null) return 1; if (b === null) return -1; return (a - b) * sign }
    return nameOf(x).localeCompare(nameOf(y), 'fr') * (sort === 'name' ? sign : 1)
  })
}

/** Identifiant de l'entrée « Sans catégorie » dans la liste (ce n'est pas un vrai choix de la propriété). */
export const NONE_ID = '__none'
const NONE_LABEL = 'Sans catégorie'
const NONE_EMOJI = '📄'

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

/** Monte (-1) ou descend (+1) une catégorie dans la liste ; sans effet aux extrémités. */
export function moveCategory(schema: Schema, id: string, direction: -1 | 1): Schema {
  return patchCategories(schema, (options) => {
    const i = options.findIndex((o) => o.id === id)
    const j = i + direction
    if (i < 0 || j < 0 || j >= options.length) return options
    const next = [...options]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })
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
  const servings = firstNumber(r.servings)
  return servings !== null ? { [RECIPE.servings]: servings } : {}
}

/** Ce qu'insère la commande « / » Recette : nom (si la page n'a pas encore de titre), durées, photo, personnes, ingrédients, étapes, notes. */
export function recipeSlashBlocks(options: { people?: number; withName?: boolean } = {}): unknown[] {
  return [
    ...(options.withName ? [{ type: 'heading', props: { level: 1 }, content: '' }] : []),
    p('Préparation : … min   ·   Cuisson : … min'),
    ...emptyRecipeBlocks(options.people ?? 4),
  ]
}

export interface RecipeEntry extends RecipeCategory {
  /** Vrai pour « Sans catégorie ». */
  isNone: boolean
}

/**
 * Les lignes de la liste, dans l'ordre choisi par l'utilisateur : les catégories et « Sans catégorie »
 * (qui a les mêmes réglages : nom, emoji, place). Les catégories absentes de l'ordre enregistré viennent à la fin.
 */
export function recipeEntries(schema: Schema): RecipeEntry[] {
  const list = schema.recipeList ?? {}
  const all: RecipeEntry[] = [
    ...recipeCategories(schema).map((c) => ({ ...c, isNone: false })),
    { id: NONE_ID, label: list.noneLabel ?? NONE_LABEL, emoji: list.noneEmoji ?? NONE_EMOJI, color: '#e3e2e0', isNone: true },
  ]
  const order = list.order ?? []
  const rank = (id: string) => {
    const i = order.indexOf(id)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  // Tri stable : sans ordre enregistré, les catégories gardent leur ordre puis « Sans catégorie ».
  return all.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e.id) - rank(b.e.id) || a.i - b.i).map((x) => x.e)
}

const withList = (schema: Schema, patch: NonNullable<Schema['recipeList']>): Schema => ({ ...schema, recipeList: { ...(schema.recipeList ?? {}), ...patch } })

/** Renomme une ligne de la liste (catégorie ou « Sans catégorie »). */
export function renameEntry(schema: Schema, id: string, label: string): Schema {
  const name = label.trim()
  if (!name) return schema
  return id === NONE_ID ? withList(schema, { noneLabel: name }) : renameCategory(schema, id, name)
}

/** Change l'emoji d'une ligne de la liste. */
export function setEntryEmoji(schema: Schema, id: string, emoji: string): Schema {
  return id === NONE_ID ? withList(schema, { noneEmoji: emoji || NONE_EMOJI }) : setCategoryEmoji(schema, id, emoji)
}

/** Monte (-1) ou descend (+1) une ligne de la liste ; sans effet aux extrémités. */
export function moveEntry(schema: Schema, id: string, direction: -1 | 1): Schema {
  const ids = recipeEntries(schema).map((e) => e.id)
  const i = ids.indexOf(id)
  const j = i + direction
  if (i < 0 || j < 0 || j >= ids.length) return schema
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  return withList(schema, { order: ids })
}
