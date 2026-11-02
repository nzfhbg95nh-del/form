import { describe, expect, it } from 'vitest'
import { convertLine, DEFAULT_EQUIVALENCES, parseEquivalences, previewConversion } from './recipeUnits'

const table = parseEquivalences(DEFAULT_EQUIVALENCES)
const conv = (line: string) => convertLine(line, table)

describe('tableau d\'équivalences', () => {
  it('lit le tableau de départ sans erreur', () => {
    expect(table.errors).toEqual([])
    expect(table.entries.length).toBeGreaterThan(80)
  })

  it('signale les lignes incomprises et garde les autres', () => {
    const t = parseEquivalences('oignon = 110 g\nn importe quoi\nsel = beaucoup\n# note\nfarine = 0,55 g/ml')
    expect(t.errors).toEqual(['n importe quoi', 'sel = beaucoup'])
    expect(t.entries.map((e) => e.label)).toEqual(['oignon', 'farine'])
  })

  it('la ligne la plus basse remplace la même ligne plus haut', () => {
    const t = parseEquivalences('oignon = 100 g\noignon = 120 g')
    expect(t.entries).toHaveLength(1)
    expect(convertLine('1 oignon', t).text).toBe('120 g d\'oignon')
  })
})

describe('pièces et contenants', () => {
  it('convertit les décimales en grammes', () => {
    expect(conv('0,52 bloc de feta végétale maison').text).toBe('105 g de feta végétale maison')
    expect(conv('0,97 bloc de feta').text).toBe('195 g de feta')
    expect(conv('1,5 oignon').text).toBe('165 g d\'oignon')
    expect(conv('3 boîtes de pois chiches rincés et égouttés').text).toBe('720 g de pois chiches rincés et égouttés')
  })

  it('passe en kg et l à partir de 1000', () => {
    expect(conv('5 pommes de terre').text).toBe('750 g de pommes de terre')
    expect(conv('10 pommes de terre').text).toBe('1,5 kg de pommes de terre')
    expect(conv('3 boîtes de lait de coco').text).toBe('1,2 l de lait de coco')
  })

  it('n\'écrit pas « de de » après une fraction', () => {
    expect(conv('¼ de concombre').text).toBe('75 g de concombre')
  })

  it('un poids déjà écrit dans la recette passe avant le tableau', () => {
    expect(conv('1 boîte de pois chiches (265 g)').text).toBe('265 g de pois chiches')
    expect(conv('2 boîtes de pois chiches (265 g)').text).toBe('530 g de pois chiches')
    expect(conv('1 petite banane bien mûre (environ 80 g)').text).toBe('80 g de banane bien mûre')
  })

  it('petit et gros ajustent le poids d\'une pièce', () => {
    expect(conv('1 petit oignon rouge').text).toBe('75 g d\'oignon rouge')
    expect(conv('1 gros oignon').text).toBe('145 g d\'oignon')
    expect(conv('1 oignon vert émincé').text).toBe('15 g d\'oignon vert émincé')
  })

  it('traite les fourchettes', () => {
    expect(conv('2 à 3 oignons').text).toBe('220 à 330 g d\'oignons')
  })

  it('laisse tels quels œufs, gousses d\'ail, pincées', () => {
    for (const l of ['2 œufs', '4 gousses d\'ail', '1 à 2 gousses d\'ail', '1 pincée de sel', '1/2 citron']) {
      expect(conv(l)).toEqual({ status: 'unchanged', text: l })
    }
  })

  it('signale sans inventer un ingrédient absent du tableau', () => {
    expect(conv('2 rutabagas')).toEqual({ status: 'unknown', text: '2 rutabagas', missing: 'rutabagas' })
  })

  it('ne convertit pas un contenant que le tableau ne connaît pas', () => {
    expect(conv('2 boîtes de sardines').status).toBe('unknown')
  })
})

describe('cuillères, verres, tasses', () => {
  it('liquide -> ml', () => {
    expect(conv('2 c. à soupe d\'huile d\'olive').text).toBe('30 ml d\'huile d\'olive')
    expect(conv('½ verre d\'eau tiède').text).toBe('100 ml d\'eau tiède')
    expect(conv('1 c. à café de vinaigre').text).toBe('5 ml de vinaigre')
    expect(conv('1 càs de sauce soja').text).toBe('15 ml de sauce soja')
  })

  it('poudre ou pâte connue -> g', () => {
    expect(conv('1 c. à café de cannelle').text).toBe('2,5 g de cannelle')
    expect(conv('2 grosses c. à soupe de pâte de poivron (doux)').text).toBe('30 g de pâte de poivron (doux)')
    expect(conv('1 tasse de farine').text).toBe('130 g de farine')
    expect(conv('1 c. à soupe de miel').text).toBe('21 g de miel')
    expect(conv('1 c. à soupe de beurre').text).toBe('14 g de beurre')
  })

  it('une remarque entre parenthèses ne change pas l\'ingrédient reconnu', () => {
    expect(conv('⅓ c. à café de sel (la pâte de poivron est déjà salée)').text).toBe('2 g de sel (la pâte de poivron est déjà salée)')
  })

  it('ingrédient inconnu -> à compléter, ligne intacte', () => {
    expect(conv('1 c. à café de zaatar')).toEqual({ status: 'unknown', text: '1 c. à café de zaatar', missing: 'zaatar' })
  })

  it('fourchette de cuillères', () => {
    expect(conv('1 à 2 c. à soupe d\'huile').text).toBe('15 à 30 ml d\'huile')
  })
})

describe('quantités déjà en g, ml, l', () => {
  it('ne touche pas aux valeurs déjà propres', () => {
    for (const l of ['200 g de chocolat noir', '280 g de lait de coco en conserve', '1 l de bouillon de poulet', '137 g de farine']) {
      expect(conv(l)).toEqual({ status: 'unchanged', text: l })
    }
  })

  it('normalise seulement l\'unité', () => {
    expect(conv('1000 g de farine').text).toBe('1 kg de farine')
    expect(conv('1500 ml d\'eau').text).toBe('1,5 l d\'eau')
    expect(conv('25 cl de crème').text).toBe('250 ml de crème')
    expect(conv('2 dl de lait').text).toBe('200 ml de lait')
    expect(conv('500 mg de sel').text).toBe('0,5 g de sel')
    expect(conv('250 grammes de beurre').text).toBe('250 g de beurre')
    expect(conv('1 à 1,3 l d\'eau').text).toBe('1 à 1,3 l d\'eau')
  })

  it('ne confond pas « g » avec « gousses », ni « l » avec « lait »', () => {
    expect(conv('3 gousses d\'ail').status).toBe('unchanged')
    expect(conv('2 limes').status).toBe('unchanged')
  })
})

describe('lignes sans quantité', () => {
  it('restent intactes', () => {
    for (const l of ['Sel', 'Un peu de piment', 'Une poignée de tomates cerises', 'Brocolis surgelés']) {
      expect(conv(l)).toEqual({ status: 'unchanged', text: l })
    }
  })
})

describe('aperçu d\'une recette', () => {
  it('liste les changements et les ingrédients à compléter, sans doublon', () => {
    const p = previewConversion(
      [
        { id: 'a', text: '0,5 bloc de feta' },
        { id: 'b', text: '200 g de farine' },
        { id: 'c', text: '1 c. à café de zaatar' },
        { id: 'd', text: '2 c. à café de zaatar' },
        { id: 'e', text: '1 c. à soupe d\'huile' },
      ],
      table,
    )
    expect(p.changes).toEqual([
      { id: 'a', before: '0,5 bloc de feta', after: '100 g de feta' },
      { id: 'e', before: '1 c. à soupe d\'huile', after: '15 ml d\'huile' },
    ])
    expect(p.missing).toEqual(['zaatar'])
  })
})
