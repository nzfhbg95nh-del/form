import { describe, expect, it } from 'vitest'
import type { Recipe } from './ai'
import { isSystemDatabase, parseSchema } from './database'
import {
  addCategory, emptyRecipeBlocks, firstNumber, groupByCategory, RECIPE, recipeBodyBlocks, recipeCategories, recipeSlashBlocks, recipesSchema, recipeValues,
  moveCategory, moveEntry, NONE_ID, normalizeRecipesSchema, recipeEntries, sortRecipes, removeCategory, renameEntry, setEntryEmoji, renameCategory, setCategoryEmoji,
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
    expect(parsed.columns.map((c) => c.id)).toEqual(['type', 'servings', 'rating', 'prep', 'difficulty', 'source'])
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
    { id: RECIPE.cook, name: 'Cuisson (min)', type: 'number' as const },
    { id: RECIPE.tags, name: 'Étiquettes', type: 'multiselect' as const },
  ]

  it('retire cuisson et étiquettes, et garde catégorie, portions et source', () => {
    const legacy = { ...recipesSchema(), columns: [...recipesSchema().columns, ...extra] }
    const clean = normalizeRecipesSchema(legacy)
    expect(clean.columns.map((c) => c.id)).toEqual(['type', 'servings', 'rating', 'prep', 'difficulty', 'source'])
    expect(normalizeRecipesSchema(clean)).toBe(clean)
  })

  it('remet « Source » dans une base où la version précédente l’avait retirée', () => {
    const withoutSource = { ...recipesSchema(), columns: recipesSchema().columns.filter((c) => c.id !== RECIPE.source) }
    const fixed = normalizeRecipesSchema(withoutSource)
    expect(fixed.columns.map((c) => c.id)).toEqual(['type', 'servings', 'rating', 'prep', 'difficulty', 'source'])
    expect(fixed.columns.at(-1)).toMatchObject({ name: 'Source', type: 'url' })
  })
})

describe('« Sans catégorie » comme les autres lignes', () => {
  const ids = (sc: ReturnType<typeof recipesSchema>) => recipeEntries(sc).map((e) => e.id)

  it('est la dernière ligne par défaut, avec un nom et un emoji', () => {
    const entries = recipeEntries(recipesSchema())
    expect(entries.at(-1)).toMatchObject({ id: NONE_ID, label: 'Sans catégorie', emoji: '📄', isNone: true })
    expect(entries).toHaveLength(8)
  })

  it('se renomme et change d’emoji', () => {
    let sc = renameEntry(recipesSchema(), NONE_ID, 'À classer')
    sc = setEntryEmoji(sc, NONE_ID, '📥')
    expect(recipeEntries(sc).at(-1)).toMatchObject({ label: 'À classer', emoji: '📥' })
    expect(recipeEntries(renameEntry(sc, NONE_ID, '  ')).at(-1)?.label).toBe('À classer')
    // une vraie catégorie passe toujours par ses propres fonctions
    expect(recipeEntries(renameEntry(sc, 'plats', 'Plats du jour')).find((e) => e.id === 'plats')?.label).toBe('Plats du jour')
  })

  it('monte et descend, au milieu des catégories', () => {
    const base = recipesSchema()
    const up = moveEntry(base, NONE_ID, -1)
    expect(ids(up).slice(-2)).toEqual([NONE_ID, 'biscuits'])
    expect(ids(moveEntry(up, NONE_ID, -1)).slice(-3)).toEqual([NONE_ID, 'entrees', 'biscuits'])
    expect(ids(moveEntry(base, NONE_ID, 1))).toEqual(ids(base))
    expect(ids(moveEntry(base, 'boissons', -1))).toEqual(ids(base))
    expect(ids(moveEntry(base, 'boissons', 1)).slice(0, 2)).toEqual(['plats', 'boissons'])
  })

  it('met à la fin une catégorie ajoutée après un réordonnancement', () => {
    const reordered = moveEntry(recipesSchema(), NONE_ID, -1)
    const added = addCategory(reordered, 'Apéro')
    expect(ids(added).at(-1)).toBe(recipeCategories(added).at(-1)!.id)
    expect(ids(added)).toContain(NONE_ID)
  })
})

describe('tri des recettes', () => {
  const r = (title: string, v: Record<string, unknown>) => ({ title, properties: JSON.stringify(v) })
  const list = [r('B', { rating: 'r3', prep: 30, difficulty: 'd2' }), r('A', {}), r('C', { rating: 'r5', prep: 10, difficulty: 'd1' })]
  const names = (x: typeof list) => x.map((i) => i.title).join('')
  it('par nom', () => expect(names(sortRecipes(list, 'name', (i) => i.title))).toBe('ABC'))
  it('par note : les mieux notées d\'abord, sans note à la fin', () => expect(names(sortRecipes(list, 'rating', (i) => i.title))).toBe('CBA'))
  it('par préparation : la plus courte d\'abord', () => expect(names(sortRecipes(list, 'prep', (i) => i.title))).toBe('CBA'))
  it('par difficulté : la plus facile d\'abord', () => expect(names(sortRecipes(list, 'difficulty', (i) => i.title))).toBe('CBA'))
})
