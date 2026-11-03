import { describe, expect, it } from 'vitest'
import { findAll, foldText, stepIndex } from './findInPage'

describe('chercher dans la page', () => {
  it('ignore majuscules et accents', () => {
    expect(findAll('Éléphant et elephant', 'ELEPHANT')).toEqual([0, 12])
  })
  it('trouve plusieurs fois, sans chevauchement', () => {
    expect(findAll('aaaa', 'aa')).toEqual([0, 2])
  })
  it('un mot vide ne trouve rien', () => {
    expect(findAll('texte', '')).toEqual([])
  })
  it('rien à trouver : liste vide', () => {
    expect(findAll('texte', 'zzz')).toEqual([])
  })
  it('les positions restent celles du texte d’origine', () => {
    expect(foldText('Crème')).toHaveLength(5)
    expect(findAll('Crème brûlée', 'brulee')).toEqual([6])
  })
  it('passe d’un résultat à l’autre en boucle', () => {
    expect(stepIndex(0, 3, 1)).toBe(1)
    expect(stepIndex(2, 3, 1)).toBe(0)
    expect(stepIndex(0, 3, -1)).toBe(2)
    expect(stepIndex(0, 0, 1)).toBe(0)
  })
})