import { describe, expect, it } from 'vitest'
import { countBy, docMatches, docYears, NO_CLIENT, NO_DOC_FILTERS, type DocFacts } from './docFilters'

const doc = (p: Partial<DocFacts>): DocFacts => ({ number: 'F-2026-001', title: 'Affiche du festival', issueDate: '2026-03-10', clientId: 'c1', clientName: 'Studio Méridien', status: 'paid', kind: 'standard', ...p })

describe('filtres des factures et devis', () => {
  it('sans filtre, tout passe', () => {
    expect(docMatches(doc({}), NO_DOC_FILTERS)).toBe(true)
  })
  it('recherche dans le numéro, l’objet et le client, sans accents ni majuscules', () => {
    expect(docMatches(doc({}), { ...NO_DOC_FILTERS, query: 'meridien affiche' })).toBe(true)
    expect(docMatches(doc({}), { ...NO_DOC_FILTERS, query: 'F-2026-001' })).toBe(true)
    expect(docMatches(doc({ number: null }), { ...NO_DOC_FILTERS, query: 'brouillon' })).toBe(true)
    expect(docMatches(doc({}), { ...NO_DOC_FILTERS, query: 'logo' })).toBe(false)
  })
  it('plusieurs choix d’un filtre = l’un ou l’autre ; filtres différents = tous', () => {
    const f = { ...NO_DOC_FILTERS, statuses: ['paid', 'overdue'], years: ['2026'] }
    expect(docMatches(doc({}), f)).toBe(true)
    expect(docMatches(doc({ status: 'overdue' }), f)).toBe(true)
    expect(docMatches(doc({ status: 'draft' }), f)).toBe(false)
    expect(docMatches(doc({ issueDate: '2025-12-31' }), f)).toBe(false)
  })
  it('type et client (un document sans client se filtre aussi)', () => {
    expect(docMatches(doc({ kind: 'deposit' }), { ...NO_DOC_FILTERS, kinds: ['standard'] })).toBe(false)
    expect(docMatches(doc({ clientId: null }), { ...NO_DOC_FILTERS, clients: [NO_CLIENT] })).toBe(true)
    expect(docMatches(doc({}), { ...NO_DOC_FILTERS, clients: [NO_CLIENT] })).toBe(false)
  })
  it('années de la plus récente à la plus ancienne, et nombres', () => {
    const docs = [doc({}), doc({ issueDate: '2025-05-01' }), doc({ issueDate: '2026-11-01', status: 'draft' })]
    expect(docYears(docs)).toEqual([{ id: '2026', count: 2 }, { id: '2025', count: 1 }])
    expect(countBy(docs, (d) => d.status).get('paid')).toBe(2)
  })
})
