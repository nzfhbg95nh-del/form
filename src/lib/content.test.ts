import { describe, expect, it } from 'vitest'
import { parseContent } from './content'

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
