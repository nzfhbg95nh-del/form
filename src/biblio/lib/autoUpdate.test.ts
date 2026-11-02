import { describe, expect, it } from 'vitest'
import { dayKey, parseFrequency, shouldAutoUpdate } from './autoUpdate'

const at = (iso: string) => new Date(`${iso}T09:30:00`)

describe('lecture du réglage', () => {
  it('reprend le nouveau réglage s\'il est valide', () => {
    expect(parseFrequency('weekly', '1')).toBe('weekly')
    expect(parseFrequency('never', null)).toBe('never')
  })

  it('sans réglage, reprend l\'ancien interrupteur : coupé = jamais, sinon au démarrage', () => {
    expect(parseFrequency(null, '0')).toBe('never')
    expect(parseFrequency(undefined, '1')).toBe('startup')
    expect(parseFrequency(null, null)).toBe('startup')
    expect(parseFrequency('nimporte quoi', '0')).toBe('never')
  })
})

describe('quand lancer la mise à jour', () => {
  it('jamais : jamais', () => {
    expect(shouldAutoUpdate('never', null, at('2026-11-02'))).toBe(false)
    expect(shouldAutoUpdate('never', '2026-01-01', at('2026-11-02'))).toBe(false)
  })

  it('au démarrage : toujours', () => {
    expect(shouldAutoUpdate('startup', '2026-11-02', at('2026-11-02'))).toBe(true)
  })

  it('une fois par jour : pas deux fois le même jour, oui le lendemain (même juste après minuit)', () => {
    expect(shouldAutoUpdate('daily', '2026-11-02', at('2026-11-02'))).toBe(false)
    expect(shouldAutoUpdate('daily', '2026-11-02', new Date('2026-11-02T23:59:00'))).toBe(false)
    expect(shouldAutoUpdate('daily', '2026-11-02', new Date('2026-11-03T00:01:00'))).toBe(true)
  })

  it('par semaine : au bout de 7 jours', () => {
    expect(shouldAutoUpdate('weekly', '2026-11-02', at('2026-11-08'))).toBe(false)
    expect(shouldAutoUpdate('weekly', '2026-11-02', at('2026-11-09'))).toBe(true)
  })

  it('par mois : au bout de 30 jours, même en traversant un changement d\'heure', () => {
    expect(shouldAutoUpdate('monthly', '2026-10-01', at('2026-10-30'))).toBe(false)
    expect(shouldAutoUpdate('monthly', '2026-10-01', at('2026-10-31'))).toBe(true)
    expect(shouldAutoUpdate('monthly', '2026-10-20', at('2026-11-18'))).toBe(false)
    expect(shouldAutoUpdate('monthly', '2026-10-20', at('2026-11-19'))).toBe(true)
  })

  it('jamais faite ou date illisible : on la fait', () => {
    expect(shouldAutoUpdate('weekly', null, at('2026-11-02'))).toBe(true)
    expect(shouldAutoUpdate('daily', '', at('2026-11-02'))).toBe(true)
    expect(shouldAutoUpdate('monthly', 'hier', at('2026-11-02'))).toBe(true)
  })

  it('une horloge reculée ne bloque pas', () => {
    expect(shouldAutoUpdate('weekly', '2027-01-01', at('2026-11-02'))).toBe(true)
  })
})

describe('jour du calendrier', () => {
  it('écrit AAAA-MM-JJ en date locale', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(dayKey(new Date(2026, 10, 2, 23, 59))).toBe('2026-11-02')
  })
})
