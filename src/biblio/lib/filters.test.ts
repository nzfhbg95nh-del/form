import { describe, expect, it } from 'vitest'
import type { GridBlock } from './blocks.ts'
import { activeCount, datePreset, EMPTY_FILTERS, filterBlocks, shuffled, withOpeningShuffle, type Filters, type TypeLookup } from './filters.ts'
import { normalize, tagKey } from './text.ts'

function block(over: Partial<GridBlock> & { id: string }): GridBlock {
  const b: GridBlock = {
    source: 'instagram', owner: 'someone', board: null, originUrl: '', kind: 'image', publishedAt: '2026-05-10', missing: false,
    rel: '', firstKind: 'image', thumb: null, ratio: 1, duration: null, count: 1, search: '', ...over,
  }
  if (!over.search) b.search = normalize(`${b.owner} ${b.board ?? ''}`)
  return b
}

const blocks = [
  block({ id: 'a', owner: 'Élodie.studio', publishedAt: '2026-09-21', kind: 'carousel' }),
  block({ id: 'b', owner: 'noe', publishedAt: '2025-01-02', kind: 'video' }),
  block({ id: 'c', source: 'pinterest', owner: 'DYSARTADD', board: '3D & CGI', publishedAt: null }),
  block({ id: 'd', source: 'pinterest', owner: 'DYSARTADD', board: 'Tattoo', publishedAt: null, missing: true }),
  block({ id: 'e', owner: 'noe', publishedAt: '2026-01-15' }),
]
const noTypes: TypeLookup = { index: new Map() }
const ids = (f: Partial<Filters>, types: TypeLookup = noTypes) => filterBlocks(blocks, { ...EMPTY_FILTERS, ...f }, types).map((b) => b.id)

describe('texte', () => {
  it('ignore accents et majuscules', () => {
    expect(normalize('Élodie CÔTÉ')).toBe('elodie cote')
  })
  it('un identifiant de type est le même avec ou sans « # », accents, majuscules et espaces en trop', () => {
    expect(tagKey('#Néon   Lights ')).toBe('neon lights')
    expect(tagKey('neon lights')).toBe('neon lights')
    expect(tagKey('  ')).toBe('')
  })
})

describe('recherche', () => {
  it('sans filtre, tout est gardé dans le même ordre', () => {
    expect(ids({})).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
  it('trouve malgré les accents et les majuscules', () => {
    expect(ids({ query: 'ELODIE' })).toEqual(['a'])
    expect(ids({ query: 'élodie' })).toEqual(['a'])
  })
  it('cherche aussi dans le nom du tableau', () => {
    expect(ids({ query: 'tattoo' })).toEqual(['d'])
  })
  it('plusieurs mots : tous doivent être présents', () => {
    expect(ids({ query: 'dysartadd cgi' })).toEqual(['c'])
    expect(ids({ query: 'noe cgi' })).toEqual([])
  })
})

describe('filtres', () => {
  it('source', () => {
    expect(ids({ sources: ['pinterest'] })).toEqual(['c', 'd'])
  })
  it('format de bloc, avec plusieurs valeurs = l\'une ou l\'autre', () => {
    expect(ids({ kinds: ['video'] })).toEqual(['b'])
    expect(ids({ kinds: ['video', 'carousel'] })).toEqual(['a', 'b'])
  })
  it('dates : bornes comprises, et les blocs sans date disparaissent', () => {
    expect(ids({ dateFrom: '2026-01-15' })).toEqual(['a', 'e'])
    expect(ids({ dateTo: '2026-01-15' })).toEqual(['b', 'e'])
    expect(ids({ dateFrom: '2026-01-01', dateTo: '2026-12-31' })).toEqual(['a', 'e'])
  })
  it('les filtres différents se cumulent', () => {
    expect(ids({ sources: ['instagram'], kinds: ['image'], dateFrom: '2026-01-01' })).toEqual(['e'])
    expect(ids({ sources: ['pinterest'], query: 'cgi', kinds: ['video'] })).toEqual([])
  })
})

describe('types d\'image', () => {
  // c : 3D & CGI ; d : Tattoo ; a : Art graphic ET Typo.
  const types: TypeLookup = {
    index: new Map([
      ['3d & cgi', new Set(['c'])],
      ['tattoo', new Set(['d'])],
      ['art graphic', new Set(['a'])],
      ['typo', new Set(['a'])],
    ]),
  }
  it('un type', () => {
    expect(ids({ types: ['typo'] }, types)).toEqual(['a'])
  })
  it('plusieurs types : l\'un ou l\'autre, un bloc compté une seule fois', () => {
    expect(ids({ types: ['typo', 'art graphic', 'tattoo'] }, types)).toEqual(['a', 'd'])
  })
  it('un type que personne n\'a ne donne rien', () => {
    expect(ids({ types: ['inconnu'] }, types)).toEqual([])
  })
  it('se cumule avec la source et le format', () => {
    expect(ids({ types: ['typo', 'tattoo'], sources: ['pinterest'] }, types)).toEqual(['d'])
    expect(ids({ types: ['typo'], kinds: ['video'] }, types)).toEqual([])
  })
})

describe('recherche par contenu', () => {
  // a : Élodie.studio ; b, e : noe. Le modèle trouve que c, puis b, ressemblent à la requête.
  const sem = new Map([['c', 0.31], ['b', 0.29], ['d', 0.27]])
  const run = (f: Partial<Filters>, s: ReadonlyMap<string, number> | null = sem) => filterBlocks(blocks, { ...EMPTY_FILTERS, ...f }, noTypes, s).map((b) => b.id)
  it('sans contenu trouvé, la recherche par nom reste comme avant', () => {
    expect(run({ query: 'noe' }, null)).toEqual(['b', 'e'])
  })
  it('ajoute les images qui ressemblent, de la plus ressemblante à la moins ressemblante', () => {
    expect(run({ query: 'tshirt' })).toEqual(['c', 'b', 'd'])
  })
  it('les noms qui correspondent passent en premier, puis les ressemblances', () => {
    // « noe » : b (nom + ressemblance 0,29) et e (nom) d'abord, puis c et d seulement par ressemblance
    expect(run({ query: 'noe' })).toEqual(['b', 'e', 'c', 'd'])
  })
  it('sans requête, le contenu trouvé ne change rien', () => {
    expect(run({})).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
  it('se cumule avec les filtres', () => {
    expect(run({ query: 'tshirt', sources: ['pinterest'] })).toEqual(['c', 'd'])
    expect(run({ query: 'tshirt', kinds: ['video'] })).toEqual(['b'])
  })
  it('le mélange aléatoire garde les mêmes images', () => {
    expect([...run({ query: 'tshirt', shuffle: 9 })].sort()).toEqual(['b', 'c', 'd'])
  })
})

describe('ordre aléatoire', () => {
  const many = Array.from({ length: 30 }, (_, i) => block({ id: 'b' + i }))
  const order = (seed: number) => filterBlocks(many, { ...EMPTY_FILTERS, shuffle: seed }, noTypes).map((b) => b.id)
  it('la même graine donne toujours le même ordre', () => {
    expect(order(42)).toEqual(order(42))
  })
  it('une autre graine donne un autre ordre', () => {
    expect(order(42)).not.toEqual(order(43))
    expect(order(42)).not.toEqual(many.map((b) => b.id))
  })
  it('aucune image perdue ni doublée', () => {
    expect([...order(7)].sort()).toEqual(many.map((b) => b.id).sort())
  })
  it('sans graine (0), l\'ordre d\'origine est gardé', () => {
    expect(order(0)).toEqual(many.map((b) => b.id))
  })
  it('se combine avec les filtres : seules les images gardées sont mélangées', () => {
    const out = filterBlocks(blocks, { ...EMPTY_FILTERS, sources: ['instagram'], shuffle: 5 }, noTypes).map((b) => b.id)
    expect([...out].sort()).toEqual(['a', 'b', 'e'])
  })
  it('ne modifie pas la liste d\'origine', () => {
    const original = [1, 2, 3, 4, 5]
    shuffled(original, 9)
    expect(original).toEqual([1, 2, 3, 4, 5])
  })
})

describe('dates rapides et compteur', () => {
  const today = new Date(2026, 9, 24) // 24 octobre 2026
  it('30 jours, 3 mois et année en cours', () => {
    expect(datePreset('30d', today)).toEqual({ from: '2026-09-24', to: '2026-10-24' })
    expect(datePreset('90d', today)).toEqual({ from: '2026-07-26', to: '2026-10-24' })
    expect(datePreset('year', today)).toEqual({ from: '2026-01-01', to: '2026-10-24' })
  })
  it('compte les critères actifs', () => {
    expect(activeCount(EMPTY_FILTERS)).toBe(0)
    expect(activeCount({ ...EMPTY_FILTERS, query: ' ', sources: ['instagram'], dateFrom: '2026-01-01', dateTo: '2026-02-01' })).toBe(2)
    expect(activeCount({ ...EMPTY_FILTERS, types: ['typo', 'tattoo'] })).toBe(1)
    expect(activeCount({ ...EMPTY_FILTERS, shuffle: 5 })).toBe(1)
  })
})

describe('collection', () => {
  const col = { id: 'pin:DYSARTADD/Tattoo', name: 'Tattoo' }
  const inCollection = new Set(['c', 'd'])
  const run = (f: Partial<Filters>, set: ReadonlySet<string> | null) =>
    filterBlocks(blocks, { ...EMPTY_FILTERS, ...f }, noTypes, null, null, set).map((b) => b.id)
  it('ne garde que les blocs de la collection', () => {
    expect(run({ collection: col }, inCollection)).toEqual(['c', 'd'])
  })
  it('se cumule avec les autres filtres', () => {
    expect(run({ collection: col, kinds: ['video'] }, inCollection)).toEqual([])
    expect(run({ collection: col, sources: ['pinterest'] }, inCollection)).toEqual(['c', 'd'])
  })
  it('sans collection ouverte, tout passe', () => {
    expect(run({}, null)).toHaveLength(blocks.length)
  })
})

describe('withOpeningShuffle', () => {
  it('applique le tirage de l\'ouverture sur la page « Tout »', () => {
    expect(withOpeningShuffle(EMPTY_FILTERS, 7).shuffle).toBe(7)
  })
  it('ne touche pas à un « Aléatoire » choisi à la main', () => {
    expect(withOpeningShuffle({ ...EMPTY_FILTERS, shuffle: 3 }, 7).shuffle).toBe(3)
  })
  it('garde l\'ordre d\'une recherche et celui d\'un tableau ouvert', () => {
    expect(withOpeningShuffle({ ...EMPTY_FILTERS, query: 'chaise' }, 7).shuffle).toBe(0)
    expect(withOpeningShuffle({ ...EMPTY_FILTERS, collection: { id: 'c1', parentId: null } as Filters['collection'] }, 7).shuffle).toBe(0)
  })
  it('les filtres affichés ne changent pas : le tirage de l\'ouverture n\'est pas un critère actif', () => {
    withOpeningShuffle(EMPTY_FILTERS, 7)
    expect(activeCount(EMPTY_FILTERS)).toBe(0)
  })
})
