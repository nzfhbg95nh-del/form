import { describe, expect, it } from 'vitest'
import { ACCENTS, DEFAULT_BOARD_PREFS, parseAccent, parseBoardPrefs, snapThreshold } from './uiPrefs'

describe('couleur d’accent', () => {
  it('reconnaît les six couleurs, sinon le bleu d’origine', () => {
    expect(ACCENTS).toHaveLength(6)
    for (const a of ACCENTS) expect(parseAccent(a.id)).toBe(a.id)
    expect(parseAccent('violet')).toBe('violet')
    expect(parseAccent('jaune')).toBe('blue')
    expect(parseAccent(null)).toBe('blue')
  })

  it('le bleu garde la couleur du fichier de style, les autres ont une variante claire et une sombre', () => {
    expect(ACCENTS[0]).toMatchObject({ id: 'blue', light: '#2383e2' })
    for (const a of ACCENTS) expect(a.light).not.toBe(a.dark)
  })
})

describe('réglages des moodboards', () => {
  it('sans réglage ou avec un réglage abîmé : les valeurs de départ', () => {
    expect(parseBoardPrefs(null)).toEqual(DEFAULT_BOARD_PREFS)
    expect(parseBoardPrefs('pas du json')).toEqual(DEFAULT_BOARD_PREFS)
    expect(parseBoardPrefs('42')).toEqual(DEFAULT_BOARD_PREFS)
  })

  it('garde ce qui est valide et remplace le reste valeur par valeur', () => {
    const prefs = parseBoardPrefs(JSON.stringify({ pattern: 'grid', bg: '#ffffff', snap: false, snapStrength: 'énorme', open: 'fit' }))
    expect(prefs).toEqual({ pattern: 'grid', bg: '#ffffff', snap: false, snapStrength: 'normal', open: 'fit' })
    expect(parseBoardPrefs(JSON.stringify({ bg: '#123456' })).bg).toBe('theme')
  })

  it('l’aimant est plus fort quand on le règle fort', () => {
    expect(snapThreshold('soft')).toBeLessThan(snapThreshold('normal'))
    expect(snapThreshold('normal')).toBeLessThan(snapThreshold('strong'))
    expect(snapThreshold('normal')).toBe(6)
  })
})
