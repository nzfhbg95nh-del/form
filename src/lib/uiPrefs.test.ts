import { describe, expect, it } from 'vitest'
import { nearestTextSize, parseMotion, parseTextScale, textScaleToPx } from './uiPrefs'

describe('animations', () => {
  it('connaît normales, réduites et aucune, sinon normales', () => {
    expect(parseMotion('reduced')).toBe('reduced')
    expect(parseMotion('none')).toBe('none')
    expect(parseMotion('normal')).toBe('normal')
    expect(parseMotion(null)).toBe('normal')
    expect(parseMotion('1')).toBe('normal')
  })
})

describe('tailles proposées', () => {
  it('rattache un pourcentage retenu à la taille proposée la plus proche', () => {
    expect(nearestTextSize(100)).toBe(100)
    expect(nearestTextSize(80)).toBe(85)
    expect(nearestTextSize(110)).toBe(115)
    expect(nearestTextSize(140)).toBe(130)
  })
})

describe('taille du texte', () => {
  it('garde un pourcentage entre 80 et 140, arrondi au pas de 5', () => {
    expect(parseTextScale('120')).toBe(120)
    expect(parseTextScale(118)).toBe(120)
    expect(parseTextScale('10')).toBe(80)
    expect(parseTextScale('900')).toBe(140)
  })

  it('revient à 100 % sans réglage ou avec une valeur illisible', () => {
    expect(parseTextScale(null)).toBe(100)
    expect(parseTextScale('')).toBe(100)
    expect(parseTextScale('énorme')).toBe(100)
  })

  it('100 % correspond à la taille de base du navigateur (16 px)', () => {
    expect(textScaleToPx(100)).toBe(16)
    expect(textScaleToPx(125)).toBe(20)
    expect(textScaleToPx(80)).toBeCloseTo(12.8)
  })
})
