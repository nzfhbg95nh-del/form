import { describe, expect, it } from 'vitest'
import { defaultCompany } from './company'
import { guideSteps, nextStep } from './guide'

const company = { ...defaultCompany(), siret: '73282932000074' }
const base = { company, clientCount: 0, quotes: [], invoices: [], payments: [] }

describe('guide du premier client', () => {
  it('commence par le client quand l’entreprise est remplie', () => {
    const steps = guideSteps(base)
    expect(steps.map((s) => s.done)).toEqual([true, false, false, false, false, true, false, false, false])
    expect(nextStep(steps)?.id).toBe('client')
  })

  it('coche les étapes d’après les devis, factures et paiements existants', () => {
    const steps = guideSteps({
      ...base,
      clientCount: 1,
      quotes: [{ status: 'accepted' }],
      invoices: [{ kind: 'deposit', status: 'issued' }, { kind: 'final', status: 'draft' }],
      payments: [],
    })
    const done = Object.fromEntries(steps.map((s) => [s.id, s.done]))
    expect(done).toMatchObject({ client: true, quote: true, sent: true, accepted: true, deposit: true, final: false, payment: false })
    expect(nextStep(steps)?.id).toBe('final')
  })

  it('met l’étape SIRET avant les factures, et n’exige pas le SIRET pour les devis', () => {
    const noSiret = guideSteps({ ...base, company: { ...company, siret: '' }, clientCount: 1, quotes: [{ status: 'sent' }] })
    expect(noSiret.findIndex((s) => s.id === 'siret')).toBeLessThan(noSiret.findIndex((s) => s.id === 'deposit'))
    expect(noSiret.find((s) => s.id === 'company')?.done).toBe(true)
    expect(noSiret.find((s) => s.id === 'siret')?.done).toBe(false)
  })

  it('n’a plus de prochaine étape quand tout est fait', () => {
    const all = guideSteps({
      company, clientCount: 1, quotes: [{ status: 'accepted' }],
      invoices: [{ kind: 'deposit', status: 'paid' }, { kind: 'final', status: 'issued' }], payments: [{ id: 'p' }],
    })
    expect(nextStep(all)).toBeUndefined()
  })
})
