import { describe, expect, it } from 'vitest'
import { loginLabel } from './siteLogin.ts'

const now = new Date('2026-11-02T12:00:00Z')
const at = (days: number) => Math.floor(now.getTime() / 1000) + days * 86_400

describe('état de la connexion', () => {
  it('dit quand on vérifie ou quand on est déconnecté', () => {
    expect(loginLabel(null, now)).toBe('Vérification…')
    expect(loginLabel({ connected: false, cookiesFile: null, expires: null }, now)).toBe('Non connecté')
  })

  it('annonce les jours restants quand la fin approche, sans bruit quand elle est lointaine', () => {
    expect(loginLabel({ connected: true, cookiesFile: 'a', expires: at(1) }, now)).toBe('Connecté (encore 1 jour)')
    expect(loginLabel({ connected: true, cookiesFile: 'a', expires: at(20) }, now)).toBe('Connecté (encore 20 jours)')
    expect(loginLabel({ connected: true, cookiesFile: 'a', expires: at(300) }, now)).toBe('Connecté')
    expect(loginLabel({ connected: true, cookiesFile: 'a', expires: null }, now)).toBe('Connecté')
  })

  it('signale une session déjà expirée', () => {
    expect(loginLabel({ connected: true, cookiesFile: 'a', expires: at(-2) }, now)).toBe('Connexion expirée')
  })
})
