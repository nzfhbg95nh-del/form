import { describe, expect, it } from 'vitest'
import type { Recipe } from './ai'
import { isSystemDatabase, parseSchema } from './database'
import {
  addCategory, emptyRecipeBlocks, firstNumber, groupByCategory, RECIPE, recipeBodyBlocks, recipeCategories, recipeSlashBlocks, recipesSchema, recipeValues,
  moveCategory, normalizeRecipesSchema, removeCategory, renameCategory, setCategoryEmoji,
} from './recipes'

const recipe: Recipe = {
  title: 'Gâteau au yaourt', servings: '6 personnes', prepMinutes: 15, cookMinutes: 35,
  ingredients: ['1 yaourt', '3 pots de farine'], steps: ['Mélanger', 'Cuire'], notes: 'Se garde 3 jours',
}

describe('base de recettes', () => {
  it('a un schéma valide, avec la galerie en premier', () => {
    const schema = recipesSchema()
    const parsed = parseSchema(JSON.stringify(schema))
    expect(parsed.kind).toBe('recipes')
    expect(parsed.views.map((v) => v.type)).toEqual(['gallery'])
    expect(parsed.columns.find((c) => c.id === RECIPE.type)!.name).toBe('Catégorie')
    expect(recipeCategories(parsed).map((c) => [c.emoji, c.label])).toEqual([
      ['🥃', 'Boissons & Cocktails'], ['🥘', 'Plats'], ['🫕', 'Petit plat du midi'], ['🥖', 'Compléments'], ['🍩', 'Desserts'], ['🥣', 'Entrée'], ['🍪', 'Biscuits, etc…'],
    ])
    expect(parsed.columns.map((c) => c.id)).toEqual(['type', 'servings', 'source'])
    expect(new Set(parsed.columns.map((c) => c.id)).size).toBe(parsed.columns.length)
  })

  it('est une base à part (hors de la liste des pages)', () => {
    expect(isSystemDatabase({ type: 'database', properties: JSON.stringify(recipesSchema()) })).toBe(true)
  })

  it('lit un nombre dans un texte', () => {
    expect(firstNumber('4 personnes')).toBe(4)
    expect(firstNumber('2 à 3 parts')).toBe(2)
    expect(firstNumber('1,5 litre')).toBe(1.5)
    expect(firstNumber('quelques-uns')).toBeNull()
  })

  it('range seulement les portions de base dans les propriétés', () => {
    expect(recipeValues(recipe)).toEqual({ servings: 6 })
    expect(recipeValues({ ...recipe, servings: '', prepMinutes: null, cookMinutes: null })).toEqual({})
  })

  it('fabrique le contenu : ingrédients, étapes, notes', () => {
    const blocks = recipeBodyBlocks(recipe) as { type: string; content?: string }[]
    expect(blocks.map((b) => b.type)).toEqual(['portions', 'heading', 'checkListItem', 'checkListItem', 'heading', 'numberedListItem', 'numberedListItem', 'heading', 'paragraph'])
    expect(blocks[2].content).toBe('1 yaourt')
    expect(blocks[8].content).toBe('Se garde 3 jours')
    expect((blocks[0] as { props?: { servings: number } }).props?.servings).toBe(6)
    expect((emptyRecipeBlocks() as { type: string }[]).filter((b) => b.type === 'heading')).toHaveLength(3)
  })

  it('la commande « / » Recette insère nom (si besoin), durées, emplacement photo, personnes et sections', () => {
    const withName = recipeSlashBlocks({ people: 2, withName: true }) as { type: string; props?: { servings?: number } }[]
    expect(withName.map((b) => b.type).slice(0, 4)).toEqual(['heading', 'paragraph', 'image', 'portions'])
    expect(withName[3].props?.servings).toBe(2)
    expect((recipeSlashBlocks() as { type: string }[]).map((b) => b.type)[0]).toBe('paragraph')
  })
})

describe('catégories de recettes', () => {
  it('ajoute, renomme, change l’emoji et supprime une catégorie', () => {
    let schema = recipesSchema()
    schema = addCategory(schema, '  Apéro  ')
    const added = recipeCategories(schema).at(-1)!
    expect([added.label, added.emoji]).toEqual(['Apéro', '🍽️'])
    expect(recipeCategories(addCategory(schema, '   '))).toHaveLength(8)

    schema = renameCategory(schema, added.id, 'Apéritifs')
    schema = setCategoryEmoji(schema, added.id, '🥂')
    expect(recipeCategories(schema).at(-1)).toMatchObject({ label: 'Apéritifs', emoji: '🥂' })
    expect(recipeCategories(renameCategory(schema, added.id, '  '))).toEqual(recipeCategories(schema))

    expect(recipeCategories(removeCategory(schema, added.id))).toHaveLength(7)
  })

  it('met un emoji de départ aux anciennes catégories qui n’en ont pas', () => {
    const old = { ...recipesSchema(), columns: recipesSchema().columns.map((c) => (c.id === RECIPE.type ? { ...c, options: c.options?.map(({ emoji: _e, ...rest }) => { void _e; return rest }) } : c)) }
    expect(recipeCategories(old)[0].emoji).toBe('🥃')
  })

  it('range les recettes par catégorie, « sans catégorie » pour le reste', () => {
    const categories = recipeCategories(recipesSchema())
    const rows = [
      { properties: JSON.stringify({ type: 'desserts' }), n: 1 },
      { properties: JSON.stringify({ type: 'desserts' }), n: 2 },
      { properties: JSON.stringify({ type: 'supprimee' }), n: 3 },
      { properties: '{}', n: 4 },
    ]
    const { byCategory, none } = groupByCategory(rows, categories, (r) => (JSON.parse(r.properties) as { type?: string }).type)
    expect(byCategory.get('desserts')?.map((r) => r.n)).toEqual([1, 2])
    expect(byCategory.get('plats')).toEqual([])
    expect(none.map((r) => r.n)).toEqual([3, 4])
  })

  it('monte et descend une catégorie', () => {
    const labels = (sc: ReturnType<typeof recipesSchema>) => recipeCategories(sc).map((c) => c.id)
    const base = recipesSchema()
    expect(labels(moveCategory(base, 'plats', -1)).slice(0, 2)).toEqual(['plats', 'boissons'])
    expect(labels(moveCategory(base, 'boissons', 1)).slice(0, 2)).toEqual(['plats', 'boissons'])
    expect(labels(moveCategory(base, 'boissons', -1))).toEqual(labels(base))
    expect(labels(moveCategory(base, 'biscuits', 1))).toEqual(labels(base))
    expect(labels(moveCategory(base, 'inconnue', 1))).toEqual(labels(base))
  })
})

describe('anciennes propriétés des recettes', () => {
  const extra = [
    { id: RECIPE.prep, name: 'Préparation (min)', type: 'number' as const },
    { id: RECIPE.cook, name: 'Cuisson (min)', type: 'number' as const },
    { id: RECIPE.rating, name: 'Note', type: 'select' as const },
    { id: RECIPE.tags, name: 'Étiquettes', type: 'multiselect' as const },
  ]

  it('retire durées, note et étiquettes, et garde catégorie, portions et source', () => {
    const legacy = { ...recipesSchema(), columns: [...recipesSchema().columns, ...extra] }
    const clean = normalizeRecipesSchema(legacy)
    expect(clean.columns.map((c) => c.id)).toEqual(['type', 'servings', 'source'])
    expect(normalizeRecipesSchema(clean)).toBe(clean)
  })

  it('remet « Source » dans une base où la version précédente l’avait retirée', () => {
    const withoutSource = { ...recipesSchema(), columns: recipesSchema().columns.filter((c) => c.id !== RECIPE.source) }
    const fixed = normalizeRecipesSchema(withoutSource)
    expect(fixed.columns.map((c) => c.id)).toEqual(['type', 'servings', 'source'])
    expect(fixed.columns.at(-1)).toMatchObject({ name: 'Source', type: 'url' })
  })
})
