import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { newClient } from './business'
import { defaultCompany } from './company'
import {
  addDays, blockersToSend, buildSnapshot, depositCents, formatQuantity, lineTotalCents, newLine, newQuote, nextNumber,
  numberPrefix, parseQuantity, parseSnapshot, quoteTotalCents,
} from './quotes'
import { buildUpsert, ISSUE_QUOTE_SQL, QUOTE_COLUMNS, QUOTE_LINE_COLUMNS } from './sql'

describe('calculs des devis (en centimes)', () => {
  it("multiplie prix et quantité sans erreur d'arrondi", () => {
    expect(lineTotalCents({ unit_price_cents: 45000, quantity_milli: 1000 })).toBe(45000)
    expect(lineTotalCents({ unit_price_cents: 45000, quantity_milli: 2500 })).toBe(112500)
    expect(lineTotalCents({ unit_price_cents: 1999, quantity_milli: 3000 })).toBe(5997)
    expect(lineTotalCents({ unit_price_cents: 333, quantity_milli: 500 })).toBe(167) // 166,5 -> 167
    expect(lineTotalCents({ unit_price_cents: 10, quantity_milli: 1 })).toBe(0)
    expect(lineTotalCents({ unit_price_cents: 10, quantity_milli: 50 })).toBe(1) // 0,5 centime -> 1
  })

  it('additionne les lignes : le total est la somme des lignes arrondies', () => {
    const lines = [{ unit_price_cents: 333, quantity_milli: 500 }, { unit_price_cents: 333, quantity_milli: 500 }]
    expect(quoteTotalCents(lines)).toBe(334)
    expect(quoteTotalCents([])).toBe(0)
  })

  it("calcule l'acompte au centime près", () => {
    expect(depositCents(100000, 30)).toBe(30000)
    expect(depositCents(33333, 30)).toBe(10000) // 9999,9 -> 10000
    expect(depositCents(1, 30)).toBe(0)
    expect(depositCents(50, 30)).toBe(15)
    expect(depositCents(12345, 0)).toBe(0)
    expect(depositCents(12345, 100)).toBe(12345)
  })

  it('lit et affiche les quantités', () => {
    expect(parseQuantity('1')).toBe(1000)
    expect(parseQuantity('2,5')).toBe(2500)
    expect(parseQuantity('0.125')).toBe(125)
    for (const bad of ['', '0', '-1', 'x', '1,2345']) expect(parseQuantity(bad)).toBeNull()
    expect(formatQuantity(1000)).toBe('1')
    expect(formatQuantity(2500)).toBe('2,5')
    expect(formatQuantity(125)).toBe('0,125')
  })
})

describe('dates et numéros', () => {
  it('ajoute des jours, même à travers les mois et les années', () => {
    expect(addDays('2026-10-04', 30)).toBe('2026-11-03')
    expect(addDays('2026-12-20', 30)).toBe('2027-01-19')
    expect(addDays('2028-02-15', 30)).toBe('2028-03-16')
  })

  it('donne le prochain numéro, continu, par année', () => {
    expect(numberPrefix('D', '2026-10-04')).toBe('D-2026-')
    expect(nextNumber('D-2026-', [])).toBe('D-2026-001')
    expect(nextNumber('D-2026-', ['D-2026-001', null, 'D-2026-002'])).toBe('D-2026-003')
    expect(nextNumber('D-2027-', ['D-2026-001', 'D-2026-002'])).toBe('D-2027-001')
    expect(nextNumber('D-2026-', ['D-2026-999'])).toBe('D-2026-1000')
  })
})

describe('envoi du devis', () => {
  const company = { ...defaultCompany(), siret: '73282932000074' }
  const client = { ...newClient(), company_name: 'Acme' }
  const quote = newQuote(company, '2026-10-04')
  const line = { ...newLine(quote.id, 0), label: 'Logo', unit_price_cents: 45000 }

  it('un devis complet peut être envoyé', () => {
    expect(blockersToSend(quote, [line], client, company)).toEqual([])
  })

  it("liste tout ce qui bloque l'envoi", () => {
    const problems = blockersToSend({ ...quote, valid_until: '2026-01-01' }, [{ ...line, label: ' ' }], undefined, defaultCompany())
    expect(problems).toHaveLength(4) // client, libellé, date de validité, réglages de l'entreprise
    expect(blockersToSend(quote, [], client, company)).toEqual(['Ajoute au moins une ligne.'])
  })

  it("fige l'entreprise, le client et la mention de TVA", () => {
    const snap = parseSnapshot(buildSnapshot(company, client, '2026-10-04'))
    expect(snap?.client.company_name).toBe('Acme')
    expect(snap?.vatMention).toContain('293 B')
    expect(parseSnapshot(buildSnapshot(company, client, '2027-02-01'))?.vatMention).toContain('L. 233-1')
    expect(snap?.company).not.toHaveProperty('logo')
    expect(parseSnapshot(null)).toBeNull()
  })
})

describe('numérotation et verrous dans SQLite (migrations exécutées pour de vrai)', () => {
  const dir = join(import.meta.dirname, '../../src-tauri/migrations')
  const freshDb = () => {
    const db = new DatabaseSync(':memory:')
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(join(dir, f), 'utf-8'))
    return db
  }
  const named = (sql: string) => sql.replace(/\$(\d+)/g, '?$1')
  type V = string | number | null

  const insertQuote = (db: DatabaseSync, id: string) => {
    const q = { ...newQuote(defaultCompany(), '2026-10-04'), id } as unknown as Record<string, V>
    db.prepare(named(buildUpsert('quotes', QUOTE_COLUMNS))).run(...QUOTE_COLUMNS.map((c) => q[c] ?? null))
  }
  const insertLine = (db: DatabaseSync, quoteId: string, id: string) => {
    const l = { ...newLine(quoteId, 0), id, label: 'Logo', unit_price_cents: 45000 } as unknown as Record<string, V>
    db.prepare(named(buildUpsert('quote_lines', QUOTE_LINE_COLUMNS))).run(...QUOTE_LINE_COLUMNS.map((c) => l[c] ?? null))
  }
  const issue = (db: DatabaseSync, id: string, prefix = 'D-2026-') =>
    db.prepare(named(ISSUE_QUOTE_SQL)).run(prefix, '2026-10-04', '2026-11-03', '{}', 'now', id)
  const numberOf = (db: DatabaseSync, id: string) => (db.prepare('SELECT number FROM quotes WHERE id = ?').get(id) as { number: string | null }).number

  it('numérote en continu, sans trou, sans doublon, par année', () => {
    const db = freshDb()
    for (const id of ['a', 'b', 'c']) insertQuote(db, id)
    issue(db, 'a')
    issue(db, 'b')
    expect([numberOf(db, 'a'), numberOf(db, 'b'), numberOf(db, 'c')]).toEqual(['D-2026-001', 'D-2026-002', null])
    issue(db, 'c', 'D-2027-')
    expect(numberOf(db, 'c')).toBe('D-2027-001')
    // même résultat que la fonction TypeScript
    insertQuote(db, 'd')
    const all = (db.prepare('SELECT number FROM quotes').all() as { number: string | null }[]).map((r) => r.number)
    issue(db, 'd')
    expect(numberOf(db, 'd')).toBe(nextNumber('D-2026-', all))
  })

  it("n'attribue jamais un deuxième numéro à un devis déjà numéroté", () => {
    const db = freshDb()
    insertQuote(db, 'a')
    issue(db, 'a')
    const again = issue(db, 'a')
    expect(Number(again.changes)).toBe(0)
    expect(numberOf(db, 'a')).toBe('D-2026-001')
  })

  it('verrouille un devis numéroté : contenu, lignes, suppression', () => {
    const db = freshDb()
    insertQuote(db, 'a')
    insertLine(db, 'a', 'l1')
    issue(db, 'a')
    expect(() => db.prepare("UPDATE quotes SET title = 'autre' WHERE id = 'a'").run()).toThrow(/ne peut plus être modifié/)
    expect(() => db.prepare("UPDATE quotes SET number = 'D-2026-099' WHERE id = 'a'").run()).toThrow()
    expect(() => insertLine(db, 'a', 'l2')).toThrow(/ne peut plus être modifié/)
    expect(() => db.prepare("UPDATE quote_lines SET label = 'x'").run()).toThrow()
    expect(() => db.prepare("DELETE FROM quote_lines WHERE id = 'l1'").run()).toThrow()
    expect(() => db.prepare("DELETE FROM quotes WHERE id = 'a'").run()).toThrow(/ne peut pas être supprimé/)
  })

  it('permet encore de passer un devis envoyé à accepté ou refusé', () => {
    const db = freshDb()
    insertQuote(db, 'a')
    issue(db, 'a')
    db.prepare("UPDATE quotes SET status = 'accepted', updated_at = 'x' WHERE id = 'a'").run()
    expect((db.prepare("SELECT status FROM quotes WHERE id = 'a'").get() as { status: string }).status).toBe('accepted')
  })

  it("laisse un brouillon entièrement modifiable et supprimable, et refuse un statut inconnu", () => {
    const db = freshDb()
    insertQuote(db, 'a')
    insertLine(db, 'a', 'l1')
    db.prepare("UPDATE quotes SET title = 'ok' WHERE id = 'a'").run()
    db.prepare("DELETE FROM quote_lines WHERE quote_id = 'a'").run()
    db.prepare("DELETE FROM quotes WHERE id = 'a'").run()
    expect(db.prepare('SELECT count(*) AS n FROM quotes').get()).toEqual({ n: 0 })
    insertQuote(db, 'b')
    expect(() => db.prepare("UPDATE quotes SET status = 'zzz' WHERE id = 'b'").run()).toThrow()
  })

  it("refuse l'enregistrement d'un brouillon quand le devis a déjà un numéro", () => {
    const db = freshDb()
    insertQuote(db, 'a')
    issue(db, 'a')
    const q = { ...newQuote(defaultCompany(), '2026-10-04'), id: 'a', title: 'tentative' } as unknown as Record<string, V>
    const guarded = named(buildUpsert('quotes', QUOTE_COLUMNS, 'quotes.number IS NULL'))
    const result = db.prepare(guarded).run(...QUOTE_COLUMNS.map((c) => q[c] ?? null))
    expect(Number(result.changes)).toBe(0)
  })
})
