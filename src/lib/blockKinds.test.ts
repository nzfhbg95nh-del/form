import { describe, expect, it } from 'vitest'
import { COLOR_IDS, colorLabel, DEFAULT_RECENT, KINDS, kindOf, nextColor, parseRecentColor } from './blockKinds'

describe('couleurs d’un bloc', () => {
  it('dix couleurs, la première est « par défaut »', () => {
    expect(COLOR_IDS).toHaveLength(10)
    expect(COLOR_IDS[0]).toBe('default')
  })
  it('nomme les couleurs comme Notion', () => {
    expect(colorLabel('text', 'gray')).toBe('Texte gris')
    expect(colorLabel('background', 'yellow')).toBe('Fond jaune')
    expect(colorLabel('background', 'default')).toBe('Fond par défaut')
  })
  it('relit la dernière couleur, ou « fond par défaut » si elle est absente ou abîmée', () => {
    expect(parseRecentColor(JSON.stringify({ kind: 'text', color: 'red' }))).toEqual({ kind: 'text', color: 'red' })
    expect(parseRecentColor(null)).toEqual(DEFAULT_RECENT)
    expect(parseRecentColor('{pas du json')).toEqual(DEFAULT_RECENT)
    expect(parseRecentColor(JSON.stringify({ kind: 'text', color: 'fuchsia' }))).toEqual(DEFAULT_RECENT)
  })
  it('Ctrl+Maj+H applique la dernière couleur, et la retire si le bloc l’a déjà', () => {
    expect(nextColor('default', { kind: 'background', color: 'yellow' })).toBe('yellow')
    expect(nextColor(undefined, { kind: 'background', color: 'yellow' })).toBe('yellow')
    expect(nextColor('yellow', { kind: 'background', color: 'yellow' })).toBe('default')
    expect(nextColor('blue', { kind: 'background', color: 'default' })).toBe('default')
  })
})

describe('types d’un bloc', () => {
  it('reconnaît le type d’un bloc de texte et son niveau de titre', () => {
    expect(kindOf({ type: 'paragraph' })?.label).toBe('Texte')
    expect(kindOf({ type: 'heading', props: { level: 3 } })?.label).toBe('Titre 3')
    expect(kindOf({ type: 'heading', props: { level: 1, isToggleable: true } })?.label).toBe('Titre déroulant 1')
    expect(kindOf({ type: 'quote' })?.label).toBe('Citation')
  })
  it('un bloc d’un autre genre (image, moodboard) n’a pas de type dans la liste', () => {
    expect(kindOf({ type: 'image' })).toBeNull()
    expect(kindOf({ type: 'moodboard' })).toBeNull()
  })
  it('chaque type a un identifiant unique', () => {
    expect(new Set(KINDS.map((k) => k.id)).size).toBe(KINDS.length)
  })
})
