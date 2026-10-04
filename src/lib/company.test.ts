import { describe, expect, it } from 'vitest'
import { DEFAULT_CGV } from './cgv'
import {
  cleanSiret, companyWarnings, defaultCompany, missingForIssuing, siretChecksumOk, vatMention,
  VAT_MENTION_FROM_2027, VAT_MENTION_UNTIL_2026,
} from './company'

describe('mention de TVA', () => {
  it("dépend de la date d'émission", () => {
    const c = defaultCompany()
    expect(vatMention(c, '2026-12-31')).toBe(VAT_MENTION_UNTIL_2026)
    expect(vatMention(c, '2027-01-01')).toBe(VAT_MENTION_FROM_2027)
    expect(vatMention(c, '2026-01-15')).toBe('TVA non applicable, art. 293 B du CGI')
    expect(vatMention(c, '2027-06-01')).toBe('TVA non applicable, article L. 233-1 du CIBS')
  })

  it('peut être remplacée par une mention choisie', () => {
    const c = { ...defaultCompany(), vatMentionOverride: '  Ma mention  ' }
    expect(vatMention(c, '2026-05-01')).toBe('Ma mention')
    expect(vatMention(c, '2028-05-01')).toBe('Ma mention')
  })
})

describe('SIRET', () => {
  it('accepte espaces et points, vérifie la clé de contrôle', () => {
    expect(cleanSiret('732 829 320 00074')).toBe('73282932000074')
    expect(siretChecksumOk('732 829 320 00074')).toBe(true)
    expect(siretChecksumOk('73282932000075')).toBe(false)
    expect(siretChecksumOk('1234')).toBe(false)
  })
})

describe("champs obligatoires avant d'émettre", () => {
  it("bloque tant que le SIRET manque, puis autorise", () => {
    const c = defaultCompany()
    expect(missingForIssuing(c)).toEqual(['SIRET (14 chiffres)'])
    expect(missingForIssuing({ ...c, siret: '73282932000074' })).toEqual([])
  })

  it("signale aussi le nom, la mention EI et l'adresse manquants", () => {
    const c = { ...defaultCompany(), legalName: '', statusMention: ' ', street: '', siret: '123' }
    expect(missingForIssuing(c)).toEqual(['Nom légal', 'Mention « Entrepreneur individuel »', 'SIRET (14 chiffres)', 'Adresse complète'])
  })

  it('avertit sans bloquer (IBAN vide, adresse hors de France, SIRET douteux)', () => {
    const w = companyWarnings({ ...defaultCompany(), siret: '73282932000075' })
    expect(w).toHaveLength(3)
    expect(companyWarnings({ ...defaultCompany(), siret: '73282932000074', iban: 'FR76 0000', country: 'France' })).toEqual([])
  })
})

describe('CGV par défaut', () => {
  it('contient les 9 articles', () => {
    expect(DEFAULT_CGV.match(/^ARTICLE \d+ - /gm)).toHaveLength(9)
    expect(DEFAULT_CGV).toContain('indemnité forfaitaire pour frais de recouvrement de 40 euros')
  })
})
