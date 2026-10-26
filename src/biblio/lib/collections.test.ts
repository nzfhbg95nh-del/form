import { describe, expect, it } from 'vitest'
import { bestChoices, childrenOf, collectionPath, groupCollections, manualCollections, openTarget, reorderIds, savedCollections, savedNote, searchCollections, withCover, withDescendants, withRecent, type CollectionCard } from './collections.ts'

const card = (id: string, name: string, kind: CollectionCard['kind'], owner: string | null, count: number, parentId: string | null = null, position: number | null = null): CollectionCard => ({
  id, name, kind, owner, description: '', parentId, position, coverBlock: null, count, previews: [],
})

const all = [
  card('pin:DYSARTADD/Tattoo', 'Tattoo', 'pinterest', 'DYSARTADD', 40),
  card('pin:DYSARTADD/Art graphic', 'Art graphic', 'pinterest', 'DYSARTADD', 1888),
  card('pin:eva/Mode', 'Mode', 'pinterest', 'evahecquet', 12),
  card('ig:muon_office', 'muon_office', 'instagram', 'muon_office', 19),
  card('ig:brigade', 'brigade', 'instagram', 'brigade', 18),
  card('ig:zed', 'zed', 'instagram', 'zed', 18),
  card('man:1', 'Projet Désert', 'manual', null, 3),
  card('man:2', 'Affiches', 'manual', null, 7),
]

describe('groupCollections', () => {
  it('range en sections : les miennes, mes tableaux, les autres tableaux, Instagram', () => {
    const s = groupCollections(all)
    expect(s.mine.map((c) => c.name)).toEqual(['Affiches', 'Projet Désert'])
    expect(s.boards.map((c) => c.name)).toEqual(['Art graphic', 'Tattoo'])
    expect(s.otherBoards.map((c) => c.name)).toEqual(['Mode'])
    expect(s.instagram.map((c) => c.name)).toEqual(['muon_office', 'brigade', 'zed'])
  })
  it('la recherche ignore les accents et les majuscules et regarde aussi le compte', () => {
    expect(groupCollections(all, 'DESERT').mine.map((c) => c.id)).toEqual(['man:1'])
    expect(groupCollections(all, 'evahecquet').otherBoards.map((c) => c.id)).toEqual(['pin:eva/Mode'])
  })
  it('une recherche sans résultat vide toutes les sections', () => {
    const s = groupCollections(all, 'zzzz')
    expect(s.mine.length + s.boards.length + s.otherBoards.length + s.instagram.length).toBe(0)
  })
})

describe('sous-collections', () => {
  const tree = [
    card('pin:DYSARTADD/Art graphic', 'Art graphic', 'pinterest', 'DYSARTADD', 1888),
    card('man:tee', 'Graphic tee', 'manual', null, 7, 'pin:DYSARTADD/Art graphic'),
    card('man:flyers', 'Flyers', 'manual', null, 21, 'pin:DYSARTADD/Art graphic'),
    card('man:sub', 'Détail', 'manual', null, 2, 'man:tee'),
    card('man:solo', 'Affiches', 'manual', null, 3),
  ]
  it("une sous-collection n'est pas dans « Mes collections » (elle est dans son tableau)", () => {
    expect(groupCollections(tree).mine.map((c) => c.id)).toEqual(['man:solo'])
  })
  it('les sous-collections directes, par nom', () => {
    expect(childrenOf(tree, 'pin:DYSARTADD/Art graphic').map((c) => c.name)).toEqual(['Flyers', 'Graphic tee'])
    expect(childrenOf(tree, 'man:solo')).toEqual([])
  })
  it("une collection et tout ce qu'elle contient, à tous les niveaux", () => {
    expect(withDescendants(tree, 'man:tee').sort()).toEqual(['man:sub', 'man:tee'])
    expect(withDescendants(tree, 'pin:DYSARTADD/Art graphic')).toHaveLength(4)
  })
  it('le chemin affiché', () => {
    expect(collectionPath(tree, 'man:sub')).toBe('Art graphic › Graphic tee › Détail')
    expect(collectionPath(tree, 'man:solo')).toBe('Affiches')
  })
  it('seules les miennes reçoivent des blocs', () => {
    expect(manualCollections(tree).map((c) => c.id)).toEqual(['man:tee', 'man:flyers', 'man:sub', 'man:solo'])
  })
})

describe('ordre choisi à la main', () => {
  it('les collections rangées passent avant les autres, dans leur ordre', () => {
    const cards = [
      card('man:a', 'Alpha', 'manual', null, 1, null, null),
      card('man:b', 'Bravo', 'manual', null, 1, null, 1),
      card('man:c', 'Charlie', 'manual', null, 1, null, 0),
    ]
    expect(groupCollections(cards).mine.map((c) => c.id)).toEqual(['man:c', 'man:b', 'man:a'])
    expect(childrenOf([card('x', 'Z', 'manual', null, 1, 'p', 1), card('y', 'A', 'manual', null, 1, 'p', null), card('w', 'M', 'manual', null, 1, 'p', 0)], 'p').map((c) => c.id)).toEqual(['w', 'x', 'y'])
  })
  it('déposer vers la droite : après la cible ; vers la gauche : avant elle', () => {
    expect(reorderIds(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
    expect(reorderIds(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })
  it('rien ne bouge si on dépose sur soi-même ou sur un inconnu', () => {
    expect(reorderIds(['a', 'b'], 'a', 'a')).toEqual(['a', 'b'])
    expect(reorderIds(['a', 'b'], 'a', 'z')).toEqual(['a', 'b'])
  })
})

describe('« À trier »', () => {
  it('forme sa propre section, avec une seule carte, et ne se mélange à aucune autre', () => {
    const cards = [card('all:unsorted', 'À trier', 'unsorted', null, 12), card('man:a', 'Alpha', 'manual', null, 3), card('ig:x', 'Instagram', 'instagram', null, 9)]
    const s = groupCollections(cards)
    expect(s.unsorted.map((c) => c.id)).toEqual(['all:unsorted'])
    expect(s.mine.map((c) => c.id)).toEqual(['man:a'])
    expect(manualCollections(cards).map((c) => c.id)).toEqual(['man:a'])
  })
})

describe('couverture', () => {
  it('la couverture choisie passe en premier, sans doublon, et on garde 4 aperçus au plus', () => {
    expect(withCover('c.jpg', ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'])).toEqual(['c.jpg', 'a.jpg', 'b.jpg', 'd.jpg'])
    expect(withCover(null, ['a.jpg', 'b.jpg'])).toEqual(['a.jpg', 'b.jpg'])
    expect(withCover('z.jpg', [])).toEqual(['z.jpg'])
  })
  it('ouvrir une collection garde son identifiant, son nom et son parent', () => {
    expect(openTarget({ id: 'x', name: 'X', parentId: 'p' })).toEqual({ id: 'x', name: 'X', parentId: 'p' })
  })
})

describe('choisir une collection', () => {
  const tree = [
    card('pin:DYSARTADD/Art graphic', 'Art graphic', 'pinterest', 'DYSARTADD', 1888),
    card('man:art', 'Art graphic', 'manual', null, 1888),
    card('man:tee', 'Graphic tee', 'manual', null, 7, 'man:art'),
    card('man:flyers', 'Flyers', 'manual', null, 21, 'man:art'),
    card('man:3d', '3D & CGI', 'manual', null, 321),
    card('man:mode', 'Mode', 'manual', null, 12),
  ]
  it('les meilleurs choix : la collection ouverte puis les plus récentes, sans doublon, 3 au plus', () => {
    expect(bestChoices(tree, ['man:3d', 'man:art', 'man:mode'], 'man:art').map((c) => c.id)).toEqual(['man:art', 'man:3d', 'man:mode'])
    expect(bestChoices(tree, ['man:3d', 'man:flyers', 'man:mode'], null).map((c) => c.id)).toEqual(['man:3d', 'man:flyers', 'man:mode'])
  })
  it('ignore ce qui n\'est pas à moi, ce qui n\'existe plus et la collection exclue', () => {
    expect(bestChoices(tree, ['pin:DYSARTADD/Art graphic', 'inconnu', 'man:mode'], 'man:art', 'man:art').map((c) => c.id)).toEqual(['man:mode'])
  })
  it('la recherche trouve tableaux et sous-tableaux par leur chemin, sans accents ni majuscules', () => {
    expect(searchCollections(tree, 'GRAPHIC').map((c) => c.id)).toEqual(['man:art', 'man:flyers', 'man:tee'])
    expect(searchCollections(tree, 'graphic tee').map((c) => c.id)).toEqual(['man:tee'])
    expect(searchCollections(tree, 'art flyers').map((c) => c.id)).toEqual(['man:flyers'])
    expect(searchCollections(tree, '  ')).toEqual([])
    expect(searchCollections(tree, 'graphic', 'man:art').map((c) => c.id)).toEqual(['man:flyers', 'man:tee'])
  })
  it('on se souvient des 6 dernières collections, la dernière d\'abord', () => {
    expect(withRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c'])
    expect(withRecent(['a', 'b', 'c', 'd', 'e', 'f'], 'z')).toEqual(['z', 'a', 'b', 'c', 'd', 'e'])
  })
})

describe('savedCollections', () => {
  const mine = [card('m:a', 'Affiches', 'manual', null, 7), card('m:b', 'Typo', 'manual', null, 3), card('m:c', 'Zèbre', 'manual', null, 1), card('pin:x', 'Tattoo', 'pinterest', 'x', 4)]
  it('ne garde que mes collections qui contiennent déjà au moins une des images, les plus remplies d\'abord', () => {
    const counts = new Map([['m:a', 1], ['m:b', 3], ['pin:x', 2]])
    expect(savedCollections(mine, counts).map((c) => c.id)).toEqual(['m:b', 'm:a'])
  })
  it('à égalité : par nom ; rien si l\'image n\'est nulle part', () => {
    expect(savedCollections(mine, new Map([['m:c', 1], ['m:a', 1]])).map((c) => c.id)).toEqual(['m:a', 'm:c'])
    expect(savedCollections(mine, new Map())).toEqual([])
  })
  it('écarte la collection exclue', () => {
    expect(savedCollections(mine, new Map([['m:a', 1]]), 'm:a')).toEqual([])
  })
})

describe('savedNote', () => {
  it('dit déjà enregistrée, ou combien de la sélection y sont', () => {
    expect(savedNote(1, 1)).toBe('Déjà enregistrée')
    expect(savedNote(3, 3)).toBe('Déjà enregistrées')
    expect(savedNote(2, 5)).toBe('2 sur 5 déjà dedans')
  })
})
