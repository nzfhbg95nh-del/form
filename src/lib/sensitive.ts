// Détection des informations sensibles AVANT qu'un texte parte chez Google (Gemini).
// Règle du cahier des charges : ne jamais envoyer montants ni coordonnées de clients sans confirmation.

export type SensitiveKind = 'iban' | 'email' | 'phone' | 'siret' | 'amount'

export interface Finding {
  kind: SensitiveKind
  text: string
}

export const KIND_LABELS: Record<SensitiveKind, string> = {
  iban: 'IBAN',
  email: 'adresse e-mail',
  phone: 'numéro de téléphone',
  siret: 'SIRET / SIREN',
  amount: 'montant',
}

const PATTERNS: [SensitiveKind, RegExp][] = [
  ['iban', /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g],
  ['email', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g],
  ['phone', /(?:\+|00)\d[\d .-]{7,}\d|\b0\d(?:[ .-]?\d{2}){4}\b/g],
  ['siret', /\b\d{3}[ ]?\d{3}[ ]?\d{3}(?:[ ]?\d{5})?\b/g],
  ['amount', /(?:€\s?\d[\d  .,]*|\d[\d  .,]*\s?(?:€|eur\b|euros?\b))/gi],
]

/** Tout ce qui ressemble à une information sensible dans le texte, avec le morceau trouvé. */
export function detectSensitive(text: string): Finding[] {
  const found: Finding[] = []
  const taken: [number, number][] = []
  for (const [kind, regex] of PATTERNS) {
    for (const m of text.matchAll(regex)) {
      const start = m.index ?? 0
      const end = start + m[0].length
      // Un même morceau n'est compté qu'une fois (un IBAN ne doit pas aussi compter comme SIRET).
      if (taken.some(([a, b]) => start < b && end > a)) continue
      taken.push([start, end])
      found.push({ kind, text: m[0].trim() })
    }
  }
  return found
}

const PLACEHOLDERS: Record<Exclude<SensitiveKind, 'amount'>, string> = {
  iban: '[IBAN]',
  email: '[E-MAIL]',
  phone: '[TÉLÉPHONE]',
  siret: '[SIRET]',
}

/** Remplace IBAN, e-mails, téléphones et SIRET par des étiquettes. Les montants restent (nécessaires pour des lignes de facture). */
export function redactContacts(text: string): string {
  let out = text
  for (const [kind, regex] of PATTERNS) {
    if (kind === 'amount') continue
    out = out.replace(regex, PLACEHOLDERS[kind])
  }
  return out
}

export interface SendPlan {
  /** Le texte exact qui partira chez Google. */
  text: string
  /** Ce qu'il contient encore de sensible. */
  remaining: Finding[]
  /** Faut-il une confirmation explicite de l'utilisateur avant l'envoi ? */
  needsConfirmation: boolean
}

export function planSend(raw: string, redact: boolean): SendPlan {
  const text = redact ? redactContacts(raw) : raw
  const remaining = detectSensitive(text)
  return { text, remaining, needsConfirmation: remaining.length > 0 }
}

/** Résumé lisible : « 2 montants, 1 adresse e-mail ». */
export function summarize(findings: Finding[]): string {
  const counts = new Map<SensitiveKind, number>()
  for (const f of findings) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1)
  return [...counts.entries()].map(([k, n]) => `${n} ${KIND_LABELS[k]}${n > 1 && k !== 'siret' ? 's' : ''}`).join(', ')
}
