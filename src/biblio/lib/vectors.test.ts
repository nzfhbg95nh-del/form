import { describe, expect, it } from 'vitest'
import { cosine, decodeVector, dot, formatBytes, formatSeconds } from './vectors.ts'

// [0.5, -1.25, 42] en flottants 32 bits petit-boutistes, encodés en base64 (même format que le côté Rust).
const B64 = btoa(String.fromCharCode(...new Uint8Array(new Float32Array([0.5, -1.25, 42]).buffer)))

describe('decodeVector', () => {
  it('relit les nombres écrits par le moteur', () => {
    expect([...decodeVector(B64)]).toEqual([0.5, -1.25, 42])
  })
  it('ignore les octets en trop', () => {
    expect(decodeVector(btoa('abcde')).length).toBe(1)
  })
})

describe('ressemblance', () => {
  it('produit scalaire', () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32)
  })
  it('deux images identiques valent 1, opposées -1, sans rapport 0', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
  })
  it('ne dépend pas de la longueur des vecteurs', () => {
    expect(cosine([2, 0], [10, 0])).toBeCloseTo(1)
    expect(cosine([0, 0], [1, 1])).toBe(0)
  })
})

describe('affichage', () => {
  it('tailles', () => {
    expect(formatBytes(351_685_709)).toBe('351,7 Mo')
    expect(formatBytes(2_500_000_000)).toBe('2,50 Go')
  })
  it('durées', () => {
    expect(formatSeconds(42)).toBe('42 s')
    expect(formatSeconds(75)).toBe('1 min 15 s')
    expect(formatSeconds(-5)).toBe('0 s')
  })
})
