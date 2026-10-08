import { describe, expect, it } from 'vitest'
import type { Recipe } from './ai'
import { isSystemDatabase, parseSchema } from './database'
import { emptyRecipeBlocks, firstNumber, RECIPE, recipeBodyBlocks, recipeSlashBlocks, recipesSchema, recipeValues } from './recipes'

const recipe: Recipe = {
  title: 'Gâteau au yaourt', servings: '6 personnes', prepMinutes: 15, cookMinutes: 35,
  ingredients: ['1 yaourt', '3 pots de farine'], steps: ['Mélanger', 'Cuire'], notes: 'Se garde 3 jours',
}

describe('base de recettes', () => {
  it('a un schéma valide, avec la galerie en premier', () => {
    const schema = recipesSchema()
    const parsed = parseSchema(JSON.stringify(schema))
    expect(parsed.kind).toBe('recipes')
    expect(parsed.views.map((v) => v.type)).toEqual(['gallery', 'table', 'table'])
    expect(parsed.views[1].groupBy).toBe(RECIPE.type)
    const categories = parsed.columns.find((c) => c.id === RECIPE.type)!
    expect(categories.name).toBe('Catégorie')
    expect(categories.options?.map((o) => o.label)).toEqual(['Boissons & cocktails', 'Plats', 'Petit plat du midi', 'Compléments', 'Desserts', 'Entrées', 'Biscuits'])
    expect(parsed.columns.map((c) => c.id)).toEqual(Object.values(RECIPE))
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

  it('range durées et portions dans les propriétés', () => {
    expect(recipeValues(recipe)).toEqual({ prep: 15, cook: 35, servings: 6 })
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
