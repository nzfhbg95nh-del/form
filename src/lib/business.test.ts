import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  centsToInput, clientAddressLines, clientDisplayName, formatEuros, newClient, newService, parseEuros, searchBusiness,
  validateClient, withDerivedSiren,
} from './business'
import { buildUpsert, CLIENT_COLUMNS, SERVICE_COLUMNS } from './sql'

describe('montants en euros', () => {
  it('lit les montants tapés par un humain, en centimes', () => {
    expect(parseEuros('450')).toBe(45000)
    expect(parseEuros('450,5')).toBe(45050)
    expect(parseEuros('1 234,50 €')).toBe(123450)
    expect(parseEuros('12.05')).toBe(1205)
    expect(parseEuros('0,99')).toBe(99)
    expect(parseEuros('0,1')).toBe(10)
  })

  it('refuse ce qui n\'est pas un montant', () => {
    for (const bad of ['', 'abc', '-5', '1,234', '1,2,3', '12 €€x']) expect(parseEuros(bad)).toBeNull()
  })

  it("n'a pas d'erreur d'arrondi (19,99 reste 1999)", () => {
    expect(parseEuros('19,99')).toBe(1999)
    expect(parseEuros('0,29')).toBe(29)
    expect(parseEuros('1.15')).toBe(115)
  })

  it('affiche et recopie les montants', () => {
    expect(formatEuros(123450).replace(/\s/g, ' ')).toBe('1 234,50 €')
    expect(formatEuros(5)).toContain('0,05')
    expect(centsToInput(123450)).toBe('1234,50')
    expect(centsToInput(5)).toBe('0,05')
    expect(parseEuros(centsToInput(98765))).toBe(98765)
  })
})

describe('clients', () => {
  it('affiche la raison sociale, sinon le nom', () => {
    expect(clientDisplayName({ ...newClient(), company_name: 'Acme', name: 'Jean' })).toBe('Acme')
    expect(clientDisplayName({ ...newClient(), name: 'Jean' })).toBe('Jean')
    expect(clientDisplayName(newClient())).toBe('Sans nom')
  })

  it("compose l'adresse sans lignes vides", () => {
    expect(clientAddressLines({ ...newClient(), street: '1 rue X', postal_code: '75001', city: 'Paris' })).toEqual(['1 rue X', '75001 Paris', 'France'])
  })

  it('exige un nom, avertit sans bloquer', () => {
    expect(validateClient(newClient()).errors).toHaveLength(1)
    const ok = validateClient({ ...newClient(), name: 'Jean', siret: '73282932000075', email: 'pas-un-mail', country: 'Belgique' })
    expect(ok.errors).toEqual([])
    expect(ok.warnings).toHaveLength(3)
    expect(validateClient({ ...newClient(), name: 'A', siret: '73282932000074', siren: '732829320' }).warnings).toEqual([])
  })

  it('déduit le SIREN du SIRET', () => {
    expect(withDerivedSiren({ ...newClient(), siret: '732 829 320 00074' }).siren).toBe('732829320')
    expect(withDerivedSiren({ ...newClient(), siret: '73282932000074', siren: '111111111' }).siren).toBe('111111111')
  })

  it('retrouve clients et prestations, sans accents', () => {
    const clients = [{ ...newClient(), company_name: 'Éditions Dupont', city: 'Lille' }, { ...newClient(), name: 'Archivé', archived_at: 'x' }]
    const services = [{ ...newService(), label: 'Logo', unit_price_cents: 45000 }]
    expect(searchBusiness(clients, services, 'edition lille').map((h) => h.kind)).toEqual(['client'])
    expect(searchBusiness(clients, services, 'logo')[0].subtitle).toContain('450,00')
    expect(searchBusiness(clients, services, 'archive')).toEqual([])
    expect(searchBusiness(clients, services, '')).toEqual([])
  })
})

describe('migrations SQL (exécutées pour de vrai dans SQLite)', () => {
  const dir = join(import.meta.dirname, '../../src-tauri/migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

  const freshDb = () => {
    const db = new DatabaseSync(':memory:')
    for (const f of files) db.exec(readFileSync(join(dir, f), 'utf-8'))
    return db
  }

  it('toutes les migrations passent à la suite, dans l\'ordre', () => {
    const db = freshDb()
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => (r as { name: string }).name)
    expect(tables).toEqual(expect.arrayContaining(['objects', 'settings', 'clients', 'services']))
  })

  it('insère puis met à jour un client avec la requête de l\'app', () => {
    const db = freshDb()
    const client = { ...newClient(), company_name: 'Acme' } as unknown as Record<string, unknown>
    const sql = buildUpsert('clients', CLIENT_COLUMNS)
    const values = CLIENT_COLUMNS.map((c) => (client[c] ?? null) as string | null)
    db.prepare(sql.replace(/\$(\d+)/g, '?$1')).run(...values)
    client.company_name = 'Acme 2'
    db.prepare(sql.replace(/\$(\d+)/g, '?$1')).run(...CLIENT_COLUMNS.map((c) => (client[c] ?? null) as string | null))
    const rows = db.prepare('SELECT company_name FROM clients').all() as { company_name: string }[]
    expect(rows).toEqual([{ company_name: 'Acme 2' }])
  })

  it('insère une prestation avec son prix en centimes', () => {
    const db = freshDb()
    const s = { ...newService(), label: 'Logo', unit_price_cents: 45000 } as unknown as Record<string, unknown>
    db.prepare(buildUpsert('services', SERVICE_COLUMNS).replace(/\$(\d+)/g, '?$1')).run(...SERVICE_COLUMNS.map((c) => (s[c] ?? null) as string | number | null))
    expect(db.prepare('SELECT unit_price_cents FROM services').get()).toEqual({ unit_price_cents: 45000 })
  })
})

describe('prestations de départ', () => {
  it('reprend les TJM de Victor : graphisme 300 €/jour, CGI 350 €/jour', async () => {
    const { defaultServices } = await import('./business')
    const services = defaultServices()
    expect(services.map((s) => [s.label, s.unit_price_cents, s.unit])).toEqual([['Graphisme', 30000, 'jour'], ['CGI', 35000, 'jour']])
    expect(services.map((s) => s.id)).toEqual(['default-graphisme', 'default-cgi'])
  })
})
