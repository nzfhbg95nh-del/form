import { describe, expect, it } from 'vitest'
import { categoryIdFor, KLIPPR_FORMAT, klipprBlocks, klipprValues, newKlipprRecipes, parseKlipprFile, prepMinutes, type KlipprRecipe } from './klippr'
import { DEFAULT_CATEGORIES, RECIPE, recipeCategories, recipesSchema } from './recipes'

const categories = recipeCategories(recipesSchema())

const recipe = (extra: Partial<KlipprRecipe> = {}): KlipprRecipe => ({
  titre: 'Baghrir',
  categorie: 'Biscuits, etc...',
  portions: '10 crêpes environ',
  temps: '5 min de mixage + 30 min de repos',
  ingredients: [{ lignes: ['250 g de semoule', '30 g de farine'] }],
  etapes: ['Mixer.', 'Cuire.'],
  notes: 'Plus la pâte repose, plus il y a de trous.',
  post: 'https://www.instagram.com/p/AAA/',
  auteur: 'chey___nese',
  ...extra,
})

describe('parseKlipprFile', () => {
  const file = (r: unknown[]) => JSON.stringify({ format: KLIPPR_FORMAT, version: 1, recettes: r })
  it('lit les recettes et ignore celles sans titre', () => {
    const out = parseKlipprFile(file([{ titre: 'A', ingredients: [{ lignes: ['x', ' '] }, { lignes: [] }], etapes: ['1'] }, { titre: '  ' }, {}]))
    expect('recipes' in out && out.recipes).toHaveLength(1)
    if ('recipes' in out) {
      expect(out.recipes[0].ingredients).toEqual([{ titre: undefined, lignes: ['x'] }])
      expect(out.recipes[0].etapes).toEqual(['1'])
    }
  })
  it("refuse un fichier qui n'est pas de Klippr, avec un message clair", () => {
    expect(parseKlipprFile('pas du json')).toEqual({ error: "Ce fichier n'est pas lisible." })
    expect(parseKlipprFile('{"format":"autre","recettes":[]}')).toEqual({ error: "Ce fichier n'a pas été exporté par Klippr." })
  })
  it("garde seulement une vraie photo et une vraie adresse", () => {
    const out = parseKlipprFile(file([{ titre: 'A', photo: 'javascript:alert(1)', post: 'ftp://x' }, { titre: 'B', photo: 'data:image/jpeg;base64,AAAA', post: 'https://x.fr/p/1' }]))
    if (!('recipes' in out)) throw new Error('erreur')
    expect(out.recipes[0]).toMatchObject({ photo: undefined, post: undefined })
    expect(out.recipes[1]).toMatchObject({ photo: 'data:image/jpeg;base64,AAAA', post: 'https://x.fr/p/1' })
  })
})

describe('catégorie', () => {
  it('retrouve la catégorie sans tenir compte des accents ni des points de suspension', () => {
    const id = (label?: string) => categoryIdFor(label, categories)
    expect(id('Plats')).toBe('plats')
    expect(id('entrée')).toBe('entrees')
    expect(id('Biscuits, etc...')).toBe('biscuits')
    expect(id('Petit plat du midi')).toBe('midi')
    expect(id('Inconnue')).toBeUndefined()
    expect(id(undefined)).toBeUndefined()
    expect(DEFAULT_CATEGORIES).toHaveLength(7)
  })
})

describe('prepMinutes', () => {
  it('lit le premier temps du texte', () => {
    expect(prepMinutes('20 min')).toBe(20)
    expect(prepMinutes('5 min de mixage + 30 min de repos')).toBe(5)
    expect(prepMinutes('1 h 30')).toBe(90)
    expect(prepMinutes('2 h de repos + 15 min')).toBe(15)
    expect(prepMinutes('10 min + 2 h au frais')).toBe(10)
    expect(prepMinutes('6 h au frais minimum (idéalement une nuit)')).toBeNull()
    expect(prepMinutes('30 min de cuisson + refroidissement')).toBeNull()
    expect(prepMinutes('15 min + 35 min de cuisson')).toBe(15)
    expect(prepMinutes('le temps de repos est important')).toBeNull()
    expect(prepMinutes(undefined)).toBeNull()
  })
})

describe('mise en forme', () => {
  it('range catégorie, portions, préparation et source dans les propriétés', () => {
    expect(klipprValues(recipe(), categories)).toEqual({ [RECIPE.type]: 'biscuits', [RECIPE.servings]: 10, [RECIPE.prep]: 5, [RECIPE.source]: 'https://www.instagram.com/p/AAA/' })
    expect(klipprValues(recipe({ categorie: undefined, portions: undefined, temps: undefined, post: undefined }), categories)).toEqual({})
  })
  it('construit la page : photo, portions, ingrédients cochables par groupe, étapes numérotées, notes', () => {
    const blocks = klipprBlocks(recipe({ photo: 'data:image/jpeg;base64,AAAA', ingredients: [{ titre: 'Pâte', lignes: ['a'] }, { lignes: ['b'] }] })) as { type: string; content?: unknown; props?: Record<string, unknown> }[]
    expect(blocks[0]).toMatchObject({ type: 'image', props: { url: 'data:image/jpeg;base64,AAAA' } })
    expect(blocks[1]).toMatchObject({ type: 'portions', props: { servings: 10 } })
    expect(blocks.filter((b) => b.type === 'checkListItem').map((b) => b.content)).toEqual(['a', 'b'])
    expect(blocks.filter((b) => b.type === 'numberedListItem').map((b) => b.content)).toEqual(['Mixer.', 'Cuire.'])
    expect(blocks.find((b) => b.type === 'paragraph' && Array.isArray(b.content))).toBeTruthy()
    const last = blocks[blocks.length - 1]
    expect(String(last.content)).toContain('Recette de @chey___nese.')
  })
  it('sans ingrédients ni étapes : des lignes vides à remplir, et 4 portions par défaut', () => {
    const blocks = klipprBlocks(recipe({ ingredients: [], etapes: [], portions: undefined })) as { type: string; content?: unknown; props?: Record<string, unknown> }[]
    expect(blocks.find((b) => b.type === 'portions')?.props).toEqual({ servings: 4 })
    expect(blocks.filter((b) => b.type === 'checkListItem')).toHaveLength(1)
    expect(blocks.filter((b) => b.type === 'numberedListItem')).toHaveLength(1)
  })
})

describe('newKlipprRecipes', () => {
  it('ne réimporte pas une recette déjà là (même post, ou même titre sans post)', () => {
    const incoming = [recipe(), recipe({ titre: 'Autre', post: 'https://www.instagram.com/p/BBB/' }), recipe({ titre: 'Gâteau', post: undefined })]
    const out = newKlipprRecipes(incoming, [{ title: 'Baghrir', source: 'https://www.instagram.com/p/AAA/' }, { title: 'GATEAU' }])
    expect(out.map((r) => r.titre)).toEqual(['Autre'])
  })
})
