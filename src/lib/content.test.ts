import { describe, expect, it } from 'vitest'
import { firstImageUrl, parseContent } from './content'

describe('lecture du contenu des pages', () => {
  it('renvoie undefined pour une page vide', () => {
    expect(parseContent(null)).toBeUndefined()
    expect(parseContent('')).toBeUndefined()
    expect(parseContent('[]')).toBeUndefined()
    expect(parseContent('pas du json')).toBeUndefined()
  })

  it('relit une liste de blocs', () => {
    const blocks = [{ type: 'paragraph', content: 'Bonjour' }]
    expect(parseContent(JSON.stringify(blocks))).toEqual(blocks)
  })

  it("convertit l'ancien format de la phase 0, ligne par ligne", () => {
    const old = JSON.stringify({ text: 'ligne 1\nligne 2' })
    expect(parseContent(old)).toEqual([
      { type: 'paragraph', content: 'ligne 1' },
      { type: 'paragraph', content: 'ligne 2' },
    ])
    expect(parseContent(JSON.stringify({ text: '  ' }))).toBeUndefined()
  })
})


describe('première image d’une page', () => {
  const png = 'data:image/png;base64,AAAA'
  it('prend la première image, même dans un sous-bloc', () => {
    const blocks = [
      { type: 'paragraph', content: [] },
      { type: 'toggleListItem', children: [{ type: 'image', props: { url: png } }] },
      { type: 'image', props: { url: 'https://exemple.fr/b.jpg' } },
    ]
    expect(firstImageUrl(JSON.stringify(blocks))).toBe(png)
  })

  it('ignore les blocs image vides ou douteux, et lit l’ancien bloc photo', () => {
    expect(firstImageUrl(JSON.stringify([{ type: 'image', props: { url: '' } }]))).toBeNull()
    expect(firstImageUrl(JSON.stringify([{ type: 'image', props: { url: 'javascript:alert(1)' } }]))).toBeNull()
    expect(firstImageUrl(JSON.stringify([{ type: 'recipephoto', props: { src: png } }]))).toBe(png)
    expect(firstImageUrl(null)).toBeNull()
    expect(firstImageUrl('pas du json')).toBeNull()
  })

  it('garde le résultat en mémoire pour une même version du contenu', () => {
    const v1 = JSON.stringify([{ type: 'image', props: { url: png } }])
    expect(firstImageUrl(v1, 'page-1:2026-10-09')).toBe(png)
    // Même clé : le résultat mémorisé est réutilisé, sans relire le contenu.
    expect(firstImageUrl('[]', 'page-1:2026-10-09')).toBe(png)
    expect(firstImageUrl('[]', 'page-1:2026-10-10')).toBeNull()
  })
})
