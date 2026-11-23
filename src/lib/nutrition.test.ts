import { describe, expect, it } from 'vitest'
import data from '../data/ciqual2020.json'
import { ALIASES, FoodIndex, loadFoods, percentOf, recipeNutrition, REFERENCES, stripUnits, weighLine } from './nutrition'

const index = new FoodIndex(loadFoods(data as never))

describe('table Ciqual', () => {
  it('est chargée, avec sa source', () => {
    expect(index.foods.length).toBeGreaterThan(3000)
    expect((data as { source: string }).source).toMatch(/Anses.*Ciqual/)
  })
  it('chaque correspondance sûre pointe vers un aliment qui existe', () => {
    const missing = ALIASES.map((a) => a[1]).filter((t) => !index.named(t))
    expect(missing).toEqual([])
  })
  it('les valeurs sont celles de la table (pois chiches en conserve)', () => {
    const f = index.named('Pois chiche, appertisé, égoutté')!
    expect(f.per100.prot).toBeCloseTo(6.74, 1)
    expect(f.per100.fe).toBeCloseTo(1.15, 1)
  })
})

describe('reconnaître un ingrédient', () => {
  const name = (s: string) => index.match(s).food?.name
  it('les ingrédients courants', () => {
    expect(name('pois chiches')).toBe('Pois chiche, appertisé, égoutté')
    expect(name('pois chiches secs')).toBe('Pois chiche, sec')
    expect(name('lentilles corail')).toBe('Lentille corail, sèche')
    expect(name('tofu ferme')).toBe('Tofu nature, préemballé')
    expect(name('oignons')).toBe('Oignon, cru')
    expect(name('huile d’olive')).toBe("Huile d'olive vierge extra")
    expect(name('jeunes pousses d’épinards')).toBe('Épinard, cru')
  })
  it('les mots d’unité ne gênent pas', () => {
    expect(stripUnits('un gros bouquet de menthe')).toBe('menthe')
    expect(name('gros bouquet de menthe')).toBe('Menthe, fraîche')
    expect(name('le jus d’un citron')).toBe('Jus de citron, pur jus')
  })
  it('un résultat douteux reste « non reconnu » plutôt qu’un mauvais aliment', () => {
    expect(index.match('fleur d’hibiscus').how).toBe('none')
    expect(index.match('gochujang').how).toBe('none')
  })
  it('l’eau ne compte pas', () => {
    expect(index.match('eau tiède').how).toBe('ignored')
  })
  it('le choix de Victor passe avant tout (ou « ne pas compter »)', () => {
    const tofu = index.named('Tofu fumé, préemballé')!
    expect(index.match('tofu', { tofu: tofu.code }).food?.name).toBe('Tofu fumé, préemballé')
    expect(index.match('tofu', { tofu: null }).how).toBe('ignored')
  })
})

describe('peser une ligne', () => {
  it('grammes, volumes, cuillères et pièces', () => {
    expect(weighLine('200 g de lentilles corail').grams).toBe(200)
    expect(weighLine('2 boîtes de pois chiches').grams).toBe(480)
    expect(weighLine('2 oignons').grams).toBe(220)
    expect(weighLine('3 gousses d’ail').grams).toBe(15)
    expect(weighLine('2 œufs').grams).toBe(100)
    expect(weighLine('1 c. à soupe d’huile d’olive').grams).toBeCloseTo(13.8, 0)
  })
  it('sans quantité : inconnu', () => {
    expect(weighLine('Sel, poivre').grams).toBeNull()
  })
})

describe('nutrition d’une recette', () => {
  const lines = ['2 boîtes de pois chiches', '2 oignons', '400 g de tomates concassées', '2 c. à soupe d’huile d’olive', 'Sel', '1 c. à café de gochujang']
  const n = recipeNutrition(lines, 4, index)
  it('additionne et ramène à une personne', () => {
    // 480 g de pois chiches en conserve (6,74 g de protéines / 100 g) = 32 g + oignons et tomates, pour 4.
    expect(n.perServing.prot!).toBeGreaterThan(9)
    expect(n.perServing.prot!).toBeLessThan(13)
    expect(n.perServing.kcal!).toBeGreaterThan(150)
    expect(n.perServing.kcal!).toBeLessThan(350)
  })
  it('dit ce qui n’a pas pu être compté', () => {
    expect(n.noQuantity).toEqual(['Sel'])
    expect(n.unknown).toEqual(['1 c. à café de gochujang'])
    expect(n.counted).toBe(4)
  })
  it('le pourcentage du repère de la journée', () => {
    const fer = REFERENCES.find((r) => r.key === 'fe')!
    expect(percentOf(5.5, fer)).toBe(50)
    expect(percentOf(undefined, fer)).toBeNull()
  })
})
