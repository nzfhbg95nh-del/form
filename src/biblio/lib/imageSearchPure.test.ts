import { describe, expect, it } from 'vitest'
import { bytesToBase64, fitSide, isSearchableImage } from './imageSearchPure.ts'

describe('recherche par image', () => {
  it('encode les octets en base64, même pour une grosse image', () => {
    expect(bytesToBase64(new Uint8Array([72, 105]))).toBe('SGk=')
    const big = new Uint8Array(200_000).fill(7)
    const decoded = Uint8Array.from(atob(bytesToBase64(big)), (c) => c.charCodeAt(0))
    expect(decoded.length).toBe(200_000)
    expect(decoded[199_999]).toBe(7)
  })

  it('réduit une image sans jamais l’agrandir', () => {
    expect(fitSide(2000, 1000, 500)).toEqual({ w: 500, h: 250 })
    expect(fitSide(300, 200, 500)).toEqual({ w: 300, h: 200 })
    expect(fitSide(1, 4000, 500)).toEqual({ w: 1, h: 500 })
  })

  it('accepte les images, pas les vidéos', () => {
    expect(isSearchableImage({ type: 'image/png' })).toBe(true)
    expect(isSearchableImage({ type: 'video/mp4' })).toBe(false)
    expect(isSearchableImage({ type: '' })).toBe(false)
  })
})
