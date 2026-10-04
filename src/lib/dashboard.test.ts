import { describe, expect, it } from 'vitest'
import { newClient } from './business'
import { defaultCompany } from './company'
import {
  collectedByMonth, collectedForMonth, collectedForYear, invoicedForYear, pendingQuotes, thresholdState, vatState, yearMonthOf,
} from './dashboard'
import { creditFromInvoice, newInvoiceLine, newStandardInvoice } from './invoices'
import { newPayment } from './payments'
import { newLine, newQuote } from './quotes'
import type { Invoice } from './types'

const company = { ...defaultCompany(), siret: '73282932000074' }

describe("chiffre d'affaires encaissé", () => {
  const p = (date: string, cents: number) => newPayment('x', date, cents)
  const payments = [p('2026-01-31', 100000), p('2026-02-01', 50000), p('2026-02-28', 25000), p('2025-12-31', 99999), p('2027-01-01', 1)]

  it('compte par année et par mois, selon la date de réception', () => {
    expect(collectedForYear(payments, 2026)).toBe(175000)
    expect(collectedForYear(payments, 2025)).toBe(99999)
    expect(collectedForMonth(payments, 2026, 2)).toBe(75000)
    expect(collectedForMonth(payments, 2026, 3)).toBe(0)
    expect(collectedByMonth(payments, 2026).slice(0, 3)).toEqual([100000, 75000, 0])
  })
})

describe('facturé sur une année', () => {
  it("additionne les factures émises et retranche les avoirs, sans les brouillons", () => {
    const a = { ...newStandardInvoice(company, '2026-03-01').invoice, id: 'a', number: 'F-2026-001', issue_date: '2026-03-01' } as Invoice
    const la = [newInvoiceLine('a', 0, { label: 'x', unit_price_cents: 100000 })]
    const credit = creditFromInvoice(company, '2026-04-01', { ...a, status: 'issued' }, la)
    const creditIssued = { ...credit.invoice, number: 'A-2026-001' } as Invoice
    const draft = { ...newStandardInvoice(company, '2026-05-01').invoice, id: 'd' }
    const ld = [newInvoiceLine('d', 0, { label: 'y', unit_price_cents: 5555 })]
    const invoices = [a, creditIssued, draft]
    const lines = [...la, ...credit.lines.map((l) => ({ ...l, unit_price_cents: -30000 })), ...ld]
    expect(invoicedForYear(invoices, lines, 2026)).toBe(70000)
    expect(invoicedForYear(invoices, lines, 2025)).toBe(0)
  })
})

describe('plafonds et seuils', () => {
  it('prévient à 80 %, signale le dépassement', () => {
    expect(thresholdState(0, 77700).level).toBe('ok')
    expect(thresholdState(62159, 77700).level).toBe('ok')
    expect(thresholdState(62160, 77700).level).toBe('near')
    expect(thresholdState(77700, 77700).level).toBe('near')
    expect(thresholdState(77701, 77700).level).toBe('over')
    expect(thresholdState(10000, 0).ratio).toBe(0)
    expect(thresholdState(50, 100).remaining).toBe(50)
    expect(thresholdState(150, 100).remaining).toBe(0)
  })

  it('distingue le seuil de TVA de base et le seuil majoré', () => {
    expect(vatState(1000, 3750000, 4125000).level).toBe('ok')
    expect(vatState(3000000, 3750000, 4125000).level).toBe('near')
    expect(vatState(3800000, 3750000, 4125000).level).toBe('over_base')
    expect(vatState(4200000, 3750000, 4125000).level).toBe('over_majored')
  })
})

describe('devis en cours et dates', () => {
  it('compte les brouillons et les devis en attente de réponse', () => {
    const mk = (id: string, status: 'draft' | 'sent' | 'accepted' | 'refused') => ({ ...newQuote(company, '2026-10-04'), id, status, client_id: newClient().id })
    const quotes = [mk('a', 'draft'), mk('b', 'sent'), mk('c', 'sent'), mk('d', 'accepted'), mk('e', 'refused')]
    const lines = [newLine('b', 0), newLine('c', 0)].map((l) => ({ ...l, unit_price_cents: 20000 }))
    expect(pendingQuotes(quotes, lines)).toEqual({ drafts: 1, waiting: 2, waitingCents: 40000 })
  })

  it("extrait l'année et le mois", () => {
    expect(yearMonthOf('2026-10-04')).toEqual({ year: 2026, month: 10 })
  })
})
