import { describe, expect, it } from 'vitest'
import { deltaE, hasColor, hexToHsv, hexToLab, hsvToHex, paletteDistance, parseColors } from './colors.ts'

describe('parseColors', () => {
  it('lit les couleurs et leur part', () => {
    const out = parseColors('ff0010:60,010203:7')
    expect(out.map((s) => [s.hex, s.pct])).toEqual([['ff0010', 60], ['010203', 7]])
  })
  it('une chaîne vide ou abîmée ne donne rien', () => {
    expect(parseColors('')).toEqual([])
    expect(parseColors('zz:3,12345:9,ff0000')).toEqual([])
  })
})

describe('hexToLab', () => {
  it('le blanc est clair et neutre, le noir sombre', () => {
    const white = hexToLab('ffffff')
    expect(white[0]).toBeCloseTo(100, 0)
    expect(Math.abs(white[1])).toBeLessThan(0.5)
    expect(hexToLab('000000')[0]).toBeCloseTo(0, 0)
  })
  it('le rouge pur est très rouge (a élevé)', () => {
    expect(hexToLab('ff0000')[1]).toBeGreaterThan(70)
  })
})

describe('hasColor', () => {
  const swatches = parseColors('d02030:55,2040c0:30,f0d010:3')
  it('trouve une couleur proche de la teinte cherchée', () => {
    expect(hasColor(swatches, hexToLab('e03131'))).toBe(true)
    expect(hasColor(swatches, hexToLab('1c4fd8'))).toBe(true)
  })
  it('ne confond pas deux teintes éloignées', () => {
    expect(hasColor(swatches, hexToLab('2f9e44'))).toBe(false)
  })
  it('ignore une couleur trop discrète (moins de 8 %)', () => {
    expect(hasColor(swatches, hexToLab('fcc419'))).toBe(false)
    expect(hasColor(swatches, hexToLab('fcc419'), 24, 1)).toBe(true)
  })
  it('un écart nul entre deux couleurs identiques', () => {
    expect(deltaE(hexToLab('336699'), hexToLab('336699'))).toBe(0)
  })
})

describe('roue de couleurs', () => {
  it('les teintes de base', () => {
    expect(hsvToHex(0, 1, 1)).toBe('ff0000')
    expect(hsvToHex(120, 1, 1)).toBe('00ff00')
    expect(hsvToHex(240, 1, 1)).toBe('0000ff')
    expect(hsvToHex(0, 0, 1)).toBe('ffffff')
    expect(hsvToHex(0, 0, 0)).toBe('000000')
  })
  it('aller-retour sans perte (à une unité près)', () => {
    for (const hex of ['e03131', '1c4fd8', '8d5a36', '12b8aa']) {
      const [h, s, v] = hexToHsv(hex)
      const back = hsvToHex(h, s, v)
      const diff = [0, 2, 4].map((i) => Math.abs(parseInt(hex.slice(i, i + 2), 16) - parseInt(back.slice(i, i + 2), 16)))
      expect(Math.max(...diff)).toBeLessThanOrEqual(1)
    }
  })
})

describe('paletteDistance', () => {
  it('deux images aux mêmes couleurs : distance nulle', () => {
    const a = parseColors('d02030:60,2040c0:30')
    expect(paletteDistance(a, a)).toBe(0)
  })
  it('des nuances voisines sont plus proches que des couleurs opposées', () => {
    const rouge = parseColors('d02030:80')
    const rougeFonce = parseColors('c01828:80')
    const bleu = parseColors('2040c0:80')
    expect(paletteDistance(rouge, rougeFonce)).toBeLessThan(paletteDistance(rouge, bleu))
    expect(paletteDistance(rouge, rougeFonce)).toBeLessThan(15)
  })
  it('est symétrique', () => {
    const a = parseColors('d02030:50,f0d010:30')
    const b = parseColors('d02030:90')
    expect(paletteDistance(a, b)).toBeCloseTo(paletteDistance(b, a), 6)
  })
  it('sans couleur retenue (image blanche ou noire, couleurs discrètes) : infini', () => {
    expect(paletteDistance([], parseColors('d02030:80'))).toBe(Infinity)
    expect(paletteDistance(parseColors('d02030:3'), parseColors('d02030:80'))).toBe(Infinity)
  })
})
