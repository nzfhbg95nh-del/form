import { describe, expect, it } from 'vitest'
import { blockLink, countWords, parseBlockLink, strippedCopy } from './blocks'
import { parsePageLink } from './windowActions'

const doc = [
  { id: 'a', type: 'paragraph', content: [{ type: 'text', text: 'Bonjour le monde' }], children: [{ id: 'b', type: 'paragraph', content: [{ type: 'text', text: 'un deux' }], children: [] }] },
  { id: 'c', type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: ' ' }], children: [] },
  { id: 'd', type: 'moodboard', props: { boardId: 'x' }, children: [] },
]

describe('blocs', () => {
  it('compte les mots et les caractères, sous-blocs compris', () => {
    expect(countWords(doc)).toEqual({ words: 5, chars: 23 })
    expect(countWords([])).toEqual({ words: 0, chars: 0 })
  })

  it('copie un bloc sans ses identifiants', () => {
    const copy = strippedCopy(doc[0]) as { id?: string; children: { id?: string }[] }
    expect(copy.id).toBeUndefined()
    expect(copy.children[0].id).toBeUndefined()
    expect(copy).toMatchObject({ type: 'paragraph', content: [{ text: 'Bonjour le monde' }] })
  })

  it('fabrique et relit un lien de bloc', () => {
    const link = blockLink('page-1', 'bloc-9')
    expect(link).toBe('form://page/page-1#bloc-9')
    expect(parseBlockLink(link)).toEqual({ pageId: 'page-1', blockId: 'bloc-9' })
    expect(parseBlockLink('form://page/page-1')).toEqual({ pageId: 'page-1', blockId: null })
    expect(parseBlockLink('https://exemple.fr')).toBeNull()
    expect(parsePageLink(link)).toBe('page-1')
  })
})
