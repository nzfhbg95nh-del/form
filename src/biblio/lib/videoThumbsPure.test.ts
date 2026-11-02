import { describe, expect, it } from 'vitest'
import { base64Of, chunk, fitThumb, frameTime, thumbName } from './videoThumbsPure.ts'

describe('nom d\'une miniature', () => {
  it('donne les valeurs de référence de FNV-1a 64 bits (les mêmes que côté Windows)', () => {
    expect(thumbName('')).toBe('cb/cbf29ce484222325.jpg')
    expect(thumbName('a')).toBe('af/af63dc4c8601ec8c.jpg')
    expect(thumbName('foobar')).toBe('85/85944171f73967e8.jpg')
  })

  it('est stable, différent d\'un fichier à l\'autre et bien formé', () => {
    const a = thumbName('instagram/0nastiia/20250718_DMQVZW8iwDw_01.mp4')
    expect(a).toBe(thumbName('instagram/0nastiia/20250718_DMQVZW8iwDw_01.mp4'))
    expect(a).not.toBe(thumbName('instagram/0nastiia/20250718_DMQVZZIikr1_02.mp4'))
    expect(a).toMatch(/^[0-9a-f]{2}\/[0-9a-f]{16}\.jpg$/)
    expect(a.slice(0, 2)).toBe(a.slice(3, 5))
  })

  it('lit les accents comme des octets UTF-8', () => {
    expect(thumbName('pinterest/Créations/été.mp4')).toMatch(/^[0-9a-f]{2}\/[0-9a-f]{16}\.jpg$/)
    expect(thumbName('é')).not.toBe(thumbName('e'))
  })
})

describe('taille de la miniature', () => {
  it('réduit à 400 px de large en gardant les proportions', () => {
    expect(fitThumb(716, 906)).toEqual({ w: 400, h: 506 })
    expect(fitThumb(1920, 1080)).toEqual({ w: 400, h: 225 })
  })

  it('ne grossit jamais une petite vidéo', () => {
    expect(fitThumb(300, 200)).toEqual({ w: 300, h: 200 })
  })

  it('limite aussi la hauteur (vidéo très étroite et très haute)', () => {
    const t = fitThumb(100, 10_000)
    expect(t.h).toBe(2000)
    expect(t.w).toBe(20)
  })

  it('renvoie 0 × 0 pour une taille inconnue', () => {
    expect(fitThumb(0, 100)).toEqual({ w: 0, h: 0 })
    expect(fitThumb(NaN, NaN)).toEqual({ w: 0, h: 0 })
  })
})

describe('instant de l\'image', () => {
  it('une demi-seconde, ou le milieu d\'une vidéo plus courte', () => {
    expect(frameTime(5.4)).toBe(0.5)
    expect(frameTime(0.9)).toBe(0.45)
  })

  it('le début si la durée est inconnue', () => {
    expect(frameTime(NaN)).toBe(0)
    expect(frameTime(Infinity)).toBe(0)
    expect(frameTime(0)).toBe(0)
  })
})

describe('petits outils', () => {
  it('extrait le contenu base64', () => {
    expect(base64Of('data:image/jpeg;base64,/9j/4AAQ')).toBe('/9j/4AAQ')
    expect(base64Of('rien')).toBe('')
  })

  it('découpe en lots', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 3)).toEqual([])
    expect(chunk([1, 2], 0)).toEqual([[1], [2]])
  })
})
