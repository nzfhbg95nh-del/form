import { describe, expect, it } from 'vitest'
import { aisleOf, buildShoppingList, ingredientKey, parseLine, parseShopping, readIngredients, shoppingLines, shoppingText } from './shoppingList'

const t = (text: string) => [{ type: 'text', text, styles: {} }]
const h = (text: string, level = 2) => ({ type: 'heading', props: { level }, content: t(text) })
const li = (text: string) => ({ type: 'checkListItem', props: {}, content: t(text) })
const p = (text: string) => ({ type: 'paragraph', props: {}, content: t(text) })

describe('lire une ligne', () => {
  it('poids, volumes et cuillères', () => {
    expect(parseLine('480 g de pois chiches')).toMatchObject({ qty: 480, family: 'g', name: 'pois chiches' })
    expect(parseLine('1,5 kg de poivrons rouges')).toMatchObject({ qty: 1500, family: 'g' })
    expect(parseLine('15 cl de crème fraîche')).toMatchObject({ qty: 150, family: 'ml' })
    expect(parseLine('2 c. à soupe d’huile d’olive')).toMatchObject({ qty: 2, family: 'cas', name: 'huile d’olive' })
    expect(parseLine('½ c. à café de curcuma')).toMatchObject({ qty: 0.5, family: 'cac', name: 'curcuma' })
  })
  it('pièces et unités comptées', () => {
    expect(parseLine('3 tomates')).toMatchObject({ qty: 3, family: 'unit', name: 'tomates' })
    expect(parseLine('4 gousses d’ail')).toMatchObject({ qty: 4, family: 'u:gousse', unit: 'gousse', name: 'ail' })
    expect(parseLine('2 boîtes de pois chiches (environ 480 g égouttés)')).toMatchObject({ qty: 2, family: 'u:boite' })
  })
  it('une fourchette : on achète le maximum', () => {
    expect(parseLine('2 à 3 c. à soupe de beurre')).toMatchObject({ qty: 3 })
  })
  it('sans quantité', () => {
    expect(parseLine('Sel, poivre')).toMatchObject({ qty: null })
    expect(parseLine('Un peu de coriandre fraîche')).toMatchObject({ qty: null, name: 'coriandre fraîche' })
  })
  it('la clé ignore pluriel, accents, précisions', () => {
    expect(ingredientKey('pois chiches cuits')).toBe(ingredientKey('pois chiche'))
    expect(ingredientKey('Tomates (bien mûres)')).toBe(ingredientKey('tomate'))
    expect(ingredientKey('oignons, émincés')).toBe('oignon')
  })
})

describe('rayons', () => {
  it('range les ingrédients courants', () => {
    expect(aisleOf('oignons')).toBe('Fruits et légumes')
    expect(aisleOf('tomates concassées en conserve')).toBe('Épicerie')
    expect(aisleOf('paneer')).toBe('Frais')
    expect(aisleOf('tofu ferme')).toBe('Frais')
    expect(aisleOf('lait de coco')).toBe('Épicerie')
    expect(aisleOf('garam masala')).toBe('Épices et condiments')
    expect(aisleOf('petits pois surgelés')).toBe('Surgelés')
    expect(aisleOf('pains pita')).toBe('Boulangerie')
    expect(aisleOf('pois chiches')).toBe('Épicerie')
  })
})

describe('liste de la semaine', () => {
  it('additionne le même ingrédient d’une recette à l’autre', () => {
    const list = buildShoppingList([
      { recipe: 'Chana', lines: ['2 oignons', '400 g de tomates concassées', 'Sel'], factor: 1 },
      { recipe: 'Dahl', lines: ['1 oignon', '400 g de tomates concassées', 'Sel'], factor: 1 },
    ])
    expect(list.find((i) => i.id.startsWith('oignon'))?.text).toBe('3 oignons')
    expect(list.find((i) => i.id.startsWith('tomate concassee'))?.text).toBe('800 g de tomates concassées')
    expect(list.filter((i) => i.id.startsWith('sel'))).toHaveLength(1)
    expect(list.find((i) => i.id.startsWith('oignon'))?.recipes).toEqual(['Chana', 'Dahl'])
  })
  it('met les quantités au nombre de personnes', () => {
    const list = buildShoppingList([{ recipe: 'Chana', lines: ['400 g de pois chiches', '2 oignons'], factor: 0.5 }])
    expect(list.map((i) => i.text)).toContain('200 g de pois chiches')
    expect(list.map((i) => i.text)).toContain('1 oignon')
  })
  it('passe en kg et en L au-delà de 1000', () => {
    const list = buildShoppingList([{ recipe: 'A', lines: ['800 g de farine', '600 ml de lait'], factor: 2 }])
    expect(list.map((i) => i.text)).toEqual(expect.arrayContaining(['1,6 kg de farine', '1,2 L de lait']))
  })
  it('un ingrédient sans quantité disparaît s’il est déjà acheté avec une quantité', () => {
    const list = buildShoppingList([
      { recipe: 'A', lines: ['2 c. à soupe d’huile d’olive'], factor: 1 },
      { recipe: 'B', lines: ['Huile d’olive'], factor: 1 },
    ])
    expect(list).toHaveLength(1)
    expect(list[0].recipes).toEqual(['A', 'B'])
  })
  it('les gousses s’additionnent en gousses', () => {
    const list = buildShoppingList([{ recipe: 'A', lines: ['1 gousse d’ail'], factor: 1 }, { recipe: 'B', lines: ['3 gousses d’ail'], factor: 1 }])
    expect(list[0].text).toBe('4 gousses d’ail')
  })
  it('le texte à copier saute les articles cochés', () => {
    const list = buildShoppingList([{ recipe: 'A', lines: ['2 oignons', '100 g de riz'], factor: 1 }])
    const txt = shoppingText(list, new Set([list.find((i) => i.id.startsWith('oignon'))!.id]), [{ text: 'Papier toilette' }])
    expect(txt).toContain('- 100 g de riz')
    expect(txt).not.toContain('oignon')
    expect(txt).toContain('- Papier toilette')
  })
})

describe('ingrédients d’une recette', () => {
  const recipe = [
    { type: 'portions', props: { servings: 4 } },
    h('Ingrédients'),
    p('Arayes'),
    li('250 g de bœuf haché'),
    li('2 pains pita'),
    p('Tzatziki'),
    li('75 g de concombre'),
    li('125 g de yaourt grec'),
    h('Étapes'),
    { type: 'numberedListItem', content: t('Mélanger.') },
  ]
  it('lit les groupes, sans prendre leurs noms pour des ingrédients', () => {
    const r = readIngredients(recipe)
    expect(r.servings).toBe(4)
    expect(r.main.map((g) => g.label)).toEqual(['Arayes', 'Tzatziki'])
    expect(r.main.flatMap((g) => g.lines)).toEqual(['250 g de bœuf haché', '2 pains pita', '75 g de concombre', '125 g de yaourt grec'])
    expect(r.variant).toBeNull()
  })
  it('une recette avec une version sans viande : c’est elle qui compte, et elle reprend le groupe cité', () => {
    const withVariant = [
      ...recipe,
      h('Version sans viande'),
      p('Le bœuf est remplacé par des lentilles.'),
      h('Ingrédients de cette version', 3),
      li('200 g de lentilles brunes cuites'),
      li('2 pains pita'),
      li('Le tzatziki de la recette, sans changement'),
      h('Ce qui change', 3),
      { type: 'numberedListItem', content: t('Faire revenir.') },
    ]
    const r = shoppingLines(withVariant)
    expect(r.variant).toBe(true)
    expect(r.lines).toEqual(['200 g de lentilles brunes cuites', '2 pains pita', '75 g de concombre', '125 g de yaourt grec'])
    expect(r.lines.join(' ')).not.toContain('bœuf')
  })
  it('sans version sans viande, les ingrédients d’origine', () => {
    expect(shoppingLines(recipe).lines).toHaveLength(4)
  })
})

describe('enregistrement', () => {
  it('relit les articles cochés et ajoutés', () => {
    const raw = JSON.stringify({ '2026-11-23': { checked: ['oignon|unit'], extra: [{ id: 'x', text: 'Café' }] }, nimp: {} })
    expect(parseShopping(raw)).toEqual({ '2026-11-23': { checked: ['oignon|unit'], extra: [{ id: 'x', text: 'Café', done: false }] } })
    expect(parseShopping('oups')).toEqual({})
  })
})

describe('finitions', () => {
  it('les pièces sont arrondies à l’unité au-dessus', () => {
    const list = buildShoppingList([{ recipe: 'A', lines: ['3 gousses d’ail', '1 bâton de cannelle', '3 piments verts'], factor: 0.6 }])
    expect(list.map((i) => i.text)).toEqual(expect.arrayContaining(['2 gousses d’ail', '1 bâton de cannelle', '2 piments verts']))
  })
  it('l’eau du robinet n’est pas à acheter', () => {
    expect(buildShoppingList([{ recipe: 'A', lines: ['300 ml d’eau', '1 l d’eau'], factor: 1 }])).toEqual([])
  })
  it('« Sel et poivre » donne deux articles, sans doublon', () => {
    const list = buildShoppingList([{ recipe: 'A', lines: ['Sel et poivre'], factor: 1 }, { recipe: 'B', lines: ['Sel'], factor: 1 }])
    expect(list.map((i) => i.text).sort()).toEqual(['Poivre', 'Sel'])
  })
  it('les deux sortes d’apostrophes donnent le même article', () => {
    const list = buildShoppingList([{ recipe: 'A', lines: ['8 ml d’huile d\'olive'], factor: 1 }, { recipe: 'B', lines: ['Huile d’olive'], factor: 1 }])
    expect(list).toHaveLength(1)
  })
  it('« de yaourt », pas « d’yaourt »', () => {
    expect(buildShoppingList([{ recipe: 'A', lines: ['125 g de yaourt grec'], factor: 1 }])[0].text).toBe('125 g de yaourt grec')
  })
  it('la pâte d’ail et gingembre est à l’épicerie', () => {
    expect(aisleOf('pâte d’ail et gingembre')).toBe('Épicerie')
    expect(aisleOf('chair de tomates (400 g)')).toBe('Épicerie')
  })
})
