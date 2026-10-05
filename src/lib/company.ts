import { DEFAULT_CGV, DEFAULT_CGV_DATE } from './cgv'
import type { Repo } from './types'

export interface Company {
  /** Nom légal de l'entrepreneur (obligatoire sur les factures). */
  legalName: string
  /** Nom commercial affiché en haut des documents. */
  tradeName: string
  /** « Entrepreneur individuel » ou « EI » (obligatoire). */
  statusMention: string
  siret: string
  street: string
  postalCode: string
  city: string
  country: string
  phone: string
  email: string
  iban: string
  bic: string
  /** Logo en image (data URL), facultatif. */
  logo: string | null
  paymentDays: number
  quoteValidityDays: number
  depositPercent: number
  latePenalty: string
  recoveryFee: number
  discountMention: string
  /** Vide = mention de TVA automatique selon la date d'émission. */
  vatMentionOverride: string
  /** Mention pour les clients hors de France (à valider par un comptable). */
  foreignClientMention: string
  foreignClientMentionConfirmed: boolean
  cgv: string
  cgvDate: string
  /** Relance de paiement : nombre de jours après l'échéance, objet et texte du message (voir REMINDER_FIELDS). */
  reminderAfterDays: number
  reminderSubject: string
  reminderBody: string
  /**
   * Plafonds en centimes. Valeurs de départ à VÉRIFIER (elles changent selon les lois de finances) :
   * l'alerte ne s'affiche comme fiable qu'après confirmation.
   */
  microCeilingCents: number
  vatBaseCents: number
  vatMajoredCents: number
  thresholdsConfirmed: boolean
}

/**
 * Valeurs de départ reprises des modèles de Victor. L'adresse (Tournai) est provisoire :
 * elle sera remplacée par l'adresse définitive de l'entreprise. Le SIRET est vide : pas encore reçu.
 */
export function defaultCompany(): Company {
  return {
    legalName: 'Sainlez Noé',
    tradeName: 'Dysart Add',
    statusMention: 'Entrepreneur individuel',
    siret: '',
    street: '48, Clos Edmond Leclercq',
    postalCode: '7548',
    city: 'Tournai',
    country: 'Belgique',
    phone: '+32 486 21 56 88',
    email: 'noe.sainlez@gmail.com',
    iban: '',
    bic: '',
    logo: null,
    paymentDays: 30,
    quoteValidityDays: 30,
    depositPercent: 30,
    latePenalty: "trois fois le taux d'intérêt légal en vigueur",
    recoveryFee: 40,
    discountMention: 'Pas d’escompte pour paiement anticipé',
    vatMentionOverride: '',
    foreignClientMention: '',
    foreignClientMentionConfirmed: false,
    cgv: DEFAULT_CGV,
    cgvDate: DEFAULT_CGV_DATE,
    microCeilingCents: 7770000,
    vatBaseCents: 3750000,
    vatMajoredCents: 4125000,
    thresholdsConfirmed: false,
    reminderAfterDays: 7,
    reminderSubject: 'Rappel de paiement : facture {numero}',
    reminderBody: [
      'Bonjour,',
      '',
      "Sauf erreur de ma part, la facture {numero} d'un montant de {montant}, échue le {echeance}, n'a pas encore été réglée ({retard} de retard).",
      '',
      'Pourriez-vous procéder au règlement par virement sur le compte suivant :',
      'IBAN {iban}',
      '',
      "Si le paiement a déjà été effectué, merci de ne pas tenir compte de ce message.",
      '',
      'Cordialement,',
      '{entreprise}',
    ].join('\n'),
  }
}

const SETTING_KEY = 'company'

export async function loadCompany(repo: Repo): Promise<Company> {
  try {
    const raw = await repo.getSetting(SETTING_KEY)
    return { ...defaultCompany(), ...(raw ? JSON.parse(raw) : {}) }
  } catch {
    return defaultCompany()
  }
}

export async function saveCompany(repo: Repo, company: Company): Promise<void> {
  await repo.setSetting(SETTING_KEY, JSON.stringify(company))
}

export const VAT_MENTION_UNTIL_2026 = 'TVA non applicable, art. 293 B du CGI'
export const VAT_MENTION_FROM_2027 = 'TVA non applicable, article L. 233-1 du CIBS'

/** Mention de TVA à inscrire : celle choisie par Victor, sinon celle qui correspond à la date d'émission. */
export function vatMention(company: Company, issueDate: string): string {
  const custom = company.vatMentionOverride.trim()
  if (custom) return custom
  return issueDate < '2027-01-01' ? VAT_MENTION_UNTIL_2026 : VAT_MENTION_FROM_2027
}

export function cleanSiret(value: string): string {
  return value.replace(/\D/g, '')
}

/** Algorithme de Luhn : sert de clé de contrôle aux SIREN et SIRET. */
export function luhnOk(digits: string): boolean {
  let total = 0
  for (const [i, c] of [...digits].reverse().entries()) {
    let d = Number(c)
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    total += d
  }
  return total % 10 === 0
}

/** Clé de contrôle des SIRET. Les SIRET de La Poste font exception. */
export function siretChecksumOk(siret: string): boolean {
  const s = cleanSiret(siret)
  if (s.length !== 14) return false
  if (s.startsWith('356000000')) return [...s].reduce((a, c) => a + Number(c), 0) % 5 === 0
  return luhnOk(s)
}

export function sirenChecksumOk(siren: string): boolean {
  const s = cleanSiret(siren)
  return s.length === 9 && luhnOk(s)
}

/**
 * Mentions légales qui manquent pour pouvoir ÉMETTRE une facture (un brouillon reste possible).
 * Pour un devis, le SIRET n'est pas exigé (`needSiret: false`) : on peut chiffrer avant de l'avoir reçu.
 */
export function missingForIssuing(company: Company, opts: { needSiret?: boolean } = {}): string[] {
  const missing: string[] = []
  if (!company.legalName.trim()) missing.push('Nom légal')
  if (!company.statusMention.trim()) missing.push('Mention « Entrepreneur individuel »')
  if (opts.needSiret !== false && cleanSiret(company.siret).length !== 14) missing.push('SIRET (14 chiffres)')
  if (!company.street.trim() || !company.postalCode.trim() || !company.city.trim()) missing.push('Adresse complète')
  return missing
}

/** Avertissements non bloquants. */
export function companyWarnings(company: Company): string[] {
  const warnings: string[] = []
  const siret = cleanSiret(company.siret)
  if (siret.length === 14 && !siretChecksumOk(siret)) warnings.push("Ce SIRET semble invalide (clé de contrôle incorrecte) : vérifie-le.")
  if (!company.iban.trim()) warnings.push("L'IBAN est vide : il n'apparaîtra pas sur les devis et factures.")
  if (company.country.trim().toLowerCase() !== 'france')
    warnings.push("L'adresse n'est pas en France : l'adresse d'une micro-entreprise française est une adresse en France (domicile ou domiciliation). À faire valider avec un comptable ou le guichet des formalités.")
  return warnings
}
