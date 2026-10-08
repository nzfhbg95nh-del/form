import { newId, type Schema } from './database'
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

const opt = (id: string, label: string, color: string) => ({ id, label, color })

/** La base « Recettes » : galerie de cartes (photo, titre), vue par catégorie et tableau, avec les infos utiles d'une recette. */
export function recipesSchema(): Schema {
  return {
    kind: 'recipes',
    columns: [
      {
        id: RECIPE.type, name: 'Catégorie', type: 'select',
        options: [
          opt('boissons', 'Boissons & cocktails', '#d3e5ef'), opt('plats', 'Plats', '#fadec9'), opt('midi', 'Petit plat du midi', '#fdecc8'),
          opt('complements', 'Compléments', '#e8deee'), opt('desserts', 'Desserts', '#f5e0e9'), opt('entrees', 'Entrées', '#dbeddb'),
          opt('biscuits', 'Biscuits', '#ede0d4'),
        ],
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
    views: [
      { id: newId(), name: 'Galerie', type: 'gallery', filters: [], sorts: [] },
      // Une section par catégorie (Plats, Desserts, Entrées...).
      { id: newId(), name: 'Par catégorie', type: 'table', filters: [], sorts: [], groupBy: RECIPE.type },
      { id: newId(), name: 'Tableau', type: 'table', filters: [], sorts: [] },
    ],
  }
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
