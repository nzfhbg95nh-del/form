import { cleanSiret, sirenChecksumOk, siretChecksumOk } from './company'
import { normalize } from './search'
import type { Client, Service } from './types'

export const UNITS = ['jour', 'heure', 'forfait', 'pièce', 'mois']

const nowISO = () => new Date().toISOString()

export function newClient(): Client {
  const t = nowISO()
  return {
    id: crypto.randomUUID(), kind: 'pro', name: '', company_name: '', siren: '', siret: '', vat_number: '',
    street: '', postal_code: '', city: '', country: 'France', email: '', phone: '', contact: '', notes: '',
    created_at: t, updated_at: t, archived_at: null,
  }
}

export function newService(): Service {
  const t = nowISO()
  return { id: crypto.randomUUID(), label: '', description: '', unit_price_cents: 0, unit: 'jour', created_at: t, updated_at: t, archived_at: null }
}

/** Prestations de départ : les taux journaliers moyens (TJM) de Victor. À modifier librement dans « Tarifs ». */
export function defaultServices(): Service[] {
  // Identifiants fixes : si le démarrage s'exécute deux fois, les deux prestations ne sont jamais doublées.
  const make = (id: string, label: string, description: string, euros: number): Service => ({ ...newService(), id, label, description, unit_price_cents: euros * 100, unit: 'jour' })
  return [
    make('default-graphisme', 'Graphisme', 'Création graphique : identité visuelle, supports de communication.', 300),
    make('default-cgi', 'CGI', 'Création d’images de synthèse : modélisation 3D, rendu, animation.', 350),
  ]
}

/** Prestations ajoutées dans une mise à jour (une seule fois, aussi pour les installations existantes). */
export function couturePrestations(): Service[] {
  return [{ ...newService(), id: 'default-couture', label: 'Couture', description: 'Travaux de couture : confection, retouches, réparations.', unit_price_cents: 1200, unit: 'heure' }]
}

export function clientDisplayName(c: Client): string {
  return c.company_name.trim() || c.name.trim() || 'Sans nom'
}

export function clientAddressLines(c: Client): string[] {
  const cityLine = [c.postal_code.trim(), c.city.trim()].filter(Boolean).join(' ')
  return [c.street.trim(), cityLine, c.country.trim()].filter(Boolean)
}

/**
 * Lit un montant tapé en euros (« 450 », « 1 234,50 », « 12.5 € ») et le renvoie en centimes.
 * Renvoie null si le texte n'est pas un montant valide (pas de négatif, 2 décimales maximum).
 */
export function parseEuros(text: string): number | null {
  const s = text.replace(/[\s €]/g, '').replace(',', '.')
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s)
  if (!m) return null
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0')
}

/** Comme parseEuros, mais accepte un « - » devant (pour les avoirs). */
export function parseSignedEuros(text: string): number | null {
  const t = text.trim()
  if (t.startsWith('-') || t.startsWith('−')) {
    const v = parseEuros(t.slice(1))
    return v === null ? null : -v
  }
  return parseEuros(t)
}

/** « 123450 » centimes -> « 1 234,50 € » */
export function formatEuros(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

/** Montant sans symbole, pour remplir un champ de saisie : 123450 -> « 1234,50 » */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

export function validateClient(c: Client): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  if (!c.company_name.trim() && !c.name.trim()) errors.push('Il faut au moins un nom ou une raison sociale.')
  const siret = cleanSiret(c.siret)
  const siren = cleanSiret(c.siren)
  if (c.siret.trim() && siret.length !== 14) warnings.push('Le SIRET doit avoir 14 chiffres.')
  else if (siret.length === 14 && !siretChecksumOk(siret)) warnings.push('Ce SIRET semble invalide (clé de contrôle incorrecte).')
  if (c.siren.trim() && siren.length !== 9) warnings.push('Le SIREN doit avoir 9 chiffres.')
  else if (siren.length === 9 && !sirenChecksumOk(siren)) warnings.push('Ce SIREN semble invalide (clé de contrôle incorrecte).')
  if (c.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) warnings.push("L'adresse e-mail semble incorrecte.")
  if (c.kind === 'pro' && c.country.trim().toLowerCase() === 'france' && !siren && !siret) {
    warnings.push("Le SIREN du client sera obligatoire sur les factures à partir de la facturation électronique (2027).")
  }
  if (c.country.trim() && c.country.trim().toLowerCase() !== 'france') {
    warnings.push('Client hors de France : la mention à mettre sur ses factures est à faire valider par un comptable (Réglages > Entreprise).')
  }
  return { errors, warnings }
}

/** Le SIREN, ce sont les 9 premiers chiffres du SIRET : on le déduit s'il n'est pas rempli. */
export function withDerivedSiren(c: Client): Client {
  const siret = cleanSiret(c.siret)
  return !c.siren.trim() && siret.length === 14 ? { ...c, siren: siret.slice(0, 9) } : c
}

export interface BusinessHit {
  kind: 'client' | 'service'
  id: string
  title: string
  subtitle: string
}

/** Recherche dans les clients et les prestations (même règles que la recherche de pages). */
export function searchBusiness(clients: Client[], services: Service[], query: string, limit = 6): BusinessHit[] {
  const tokens = normalize(query).trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []
  const hits: BusinessHit[] = []
  for (const c of clients) {
    if (c.archived_at) continue
    const haystack = normalize([c.name, c.company_name, c.email, c.city, c.siren, c.siret, c.contact].join(' '))
    if (tokens.every((t) => haystack.includes(t))) {
      hits.push({ kind: 'client', id: c.id, title: clientDisplayName(c), subtitle: ['Client', c.city].filter(Boolean).join(' · ') })
    }
  }
  for (const s of services) {
    if (s.archived_at) continue
    if (tokens.every((t) => normalize(`${s.label} ${s.description}`).includes(t))) {
      hits.push({ kind: 'service', id: s.id, title: s.label || 'Sans libellé', subtitle: `Prestation · ${formatEuros(s.unit_price_cents)} / ${s.unit}` })
    }
  }
  return hits.slice(0, limit)
}
