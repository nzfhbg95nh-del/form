import { describe, expect, it } from 'vitest'
import { blockLabel, daysAround } from './homeData.ts'

describe('données de l’accueil', () => {
  it('donne les sept jours (MM-JJ) autour d’aujourd’hui, en passant d’un mois à l’autre', () => {
    expect(daysAround(new Date(2026, 9, 27))).toEqual(['10-24', '10-25', '10-26', '10-27', '10-28', '10-29', '10-30'])
    expect(daysAround(new Date(2026, 0, 2))).toEqual(['12-30', '12-31', '01-01', '01-02', '01-03', '01-04', '01-05'])
    expect(daysAround(new Date(2026, 9, 27), 0)).toEqual(['10-27'])
  })
  it('nomme une image selon sa source', () => {
    expect(blockLabel({ source: 'instagram', owner: 'alliage.work', board: null })).toBe('@alliage.work')
    expect(blockLabel({ source: 'pinterest', owner: 'DYSARTADD', board: '3D & CGI' })).toBe('3D & CGI')
    expect(blockLabel({ source: 'manual', owner: 'Mes ajouts', board: null })).toBe('Ajoutée à la main')
  })
})
