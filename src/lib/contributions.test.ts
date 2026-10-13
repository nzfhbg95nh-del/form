import { describe, expect, it } from 'vitest'
import { contributionPlan, percentOfCents, periodOf, previousPeriodOf, summarizePeriod, type ContributionSettings } from './contributions'
import type { Payment } from './types'

const pay = (paid_on: string, amount_cents: number): Payment => ({ id: paid_on + amount_cents, invoice_id: 'i', paid_on, amount_cents, method: 'virement', note: '' }) as unknown as Payment

const monthly: ContributionSettings = { ratePercent: 26.1, liberatory: false, liberatoryRatePercent: 2.2, period: 'monthly' }
const quarterly: ContributionSettings = { ...monthly, period: 'quarterly' }

describe('montants', () => {
  it('calcule un pourcentage en centimes, arrondi', () => {
    expect(percentOfCents(100000, 26.1)).toBe(26100)
    expect(percentOfCents(33333, 26.1)).toBe(8700)
    expect(percentOfCents(0, 26.1)).toBe(0)
    expect(percentOfCents(100000, 0)).toBe(0)
    expect(percentOfCents(-5000, 26.1)).toBe(0)
    expect(percentOfCents(NaN, 26.1)).toBe(0)
  })
})

describe('périodes de déclaration', () => {
  it('mensuelle : fin du mois suivant', () => {
    const p = periodOf('2026-10-13', 'monthly')
    expect(p).toMatchObject({ key: '2026-10', start: '2026-10-01', end: '2026-10-31', deadline: '2026-11-30' })
    expect(periodOf('2026-12-05', 'monthly').deadline).toBe('2027-01-31')
    expect(periodOf('2028-01-31', 'monthly').deadline).toBe('2028-02-29')
  })

  it('trimestrielle : fin du mois suivant le trimestre', () => {
    expect(periodOf('2026-10-13', 'quarterly')).toMatchObject({ key: '2026-T4', start: '2026-10-01', end: '2026-12-31', deadline: '2027-01-31' })
    expect(periodOf('2026-02-10', 'quarterly')).toMatchObject({ key: '2026-T1', end: '2026-03-31', deadline: '2026-04-30' })
    expect(periodOf('2026-08-01', 'quarterly').deadline).toBe('2026-10-31')
  })

  it('la période précédente, y compris au changement d\'année', () => {
    expect(previousPeriodOf('2026-01-10', 'monthly').key).toBe('2025-12')
    expect(previousPeriodOf('2026-01-10', 'quarterly').key).toBe('2025-T4')
    expect(previousPeriodOf('2026-10-13', 'quarterly').key).toBe('2026-T3')
  })
})

describe('plan de cotisations', () => {
  const payments = [pay('2026-09-10', 100000), pay('2026-09-28', 50000), pay('2026-10-05', 200000), pay('2025-12-20', 999900)]

  it('résume la période en cours et la période à déclarer', () => {
    const plan = contributionPlan(payments, '2026-10-13', monthly)
    expect(plan.current.collectedCents).toBe(200000)
    expect(plan.current.contributionCents).toBe(52200)
    expect(plan.toDeclare).toMatchObject({ key: '2026-09', collectedCents: 150000, contributionCents: 39150 })
    expect(plan.daysLeft).toBe(18)
  })

  it('cumule l\'année en cours seulement et calcule le net', () => {
    const plan = contributionPlan(payments, '2026-10-13', monthly)
    expect(plan.year.collectedCents).toBe(350000)
    expect(plan.year.contributionCents).toBe(91350)
    expect(plan.year.netCents).toBe(350000 - 91350)
  })

  it('compte le versement libératoire seulement s\'il est activé', () => {
    const on = contributionPlan(payments, '2026-10-13', { ...monthly, liberatory: true })
    expect(on.year.incomeTaxCents).toBe(7700)
    expect(on.year.netCents).toBe(350000 - 91350 - 7700)
    expect(contributionPlan(payments, '2026-10-13', monthly).year.incomeTaxCents).toBe(0)
  })

  it('trimestriel : le trimestre terminé n\'est plus à déclarer une fois sa date limite passée', () => {
    expect(contributionPlan(payments, '2026-10-13', quarterly).toDeclare).toMatchObject({ key: '2026-T3', collectedCents: 150000 })
    expect(contributionPlan(payments, '2026-11-13', quarterly).toDeclare).toBeNull()
    expect(contributionPlan(payments, '2026-11-13', quarterly).daysLeft).toBeNull()
  })

  it('résume une période sans encaissement', () => {
    const s = summarizePeriod([], periodOf('2026-10-13', 'monthly'), monthly)
    expect(s).toMatchObject({ collectedCents: 0, contributionCents: 0, incomeTaxCents: 0 })
  })
})
