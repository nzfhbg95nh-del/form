import type { Payment } from './types'

/**
 * Cotisations d'une micro-entreprise : un pourcentage du chiffre d'affaires ENCAISSÉ, déclaré chaque mois ou chaque trimestre.
 * Ce sont des estimations pour savoir combien mettre de côté : la déclaration se fait sur le site de l'URSSAF.
 */
export type DeclarationPeriod = 'monthly' | 'quarterly'

export interface ContributionSettings {
  /** Taux total de cotisations, en pourcentage (ex. 26.1). */
  ratePercent: number
  /** Versement libératoire de l'impôt sur le revenu (facultatif). */
  liberatory: boolean
  liberatoryRatePercent: number
  period: DeclarationPeriod
}

/** Montant dû (en centimes) pour un chiffre d'affaires et un taux en pourcentage ; jamais négatif. */
export function percentOfCents(cents: number, ratePercent: number): number {
  if (!Number.isFinite(cents) || !Number.isFinite(ratePercent) || cents <= 0 || ratePercent <= 0) return 0
  return Math.round((cents * ratePercent) / 100)
}

export interface PeriodInfo {
  /** « 2026-10 » ou « 2026-T4 ». */
  key: string
  label: string
  /** Premier et dernier jour de la période (ISO). */
  start: string
  end: string
  /** Dernier jour pour déclarer : fin du mois qui suit la période. */
  deadline: string
}

const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const pad = (n: number) => String(n).padStart(2, '0')

/** Dernier jour d'un mois (month de 1 à 12), au format ISO. */
function lastDay(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${pad(month)}-${pad(d)}`
}

/** Ajoute des mois à (année, mois) en gardant le mois entre 1 et 12. */
function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/** La période de déclaration qui contient une date ISO. */
export function periodOf(dateIso: string, period: DeclarationPeriod): PeriodInfo {
  const year = Number(dateIso.slice(0, 4))
  const month = Number(dateIso.slice(5, 7))
  if (period === 'monthly') {
    const after = addMonths(year, month, 1)
    return {
      key: `${year}-${pad(month)}`,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
      start: `${year}-${pad(month)}-01`,
      end: lastDay(year, month),
      deadline: lastDay(after.year, after.month),
    }
  }
  const quarter = Math.floor((month - 1) / 3) + 1
  const firstMonth = (quarter - 1) * 3 + 1
  const lastMonth = firstMonth + 2
  const after = addMonths(year, lastMonth, 1)
  return {
    key: `${year}-T${quarter}`,
    label: `${quarter === 1 ? '1er' : `${quarter}e`} trimestre ${year}`,
    start: `${year}-${pad(firstMonth)}-01`,
    end: lastDay(year, lastMonth),
    deadline: lastDay(after.year, after.month),
  }
}

/** La période juste avant celle d'une date. */
export function previousPeriodOf(dateIso: string, period: DeclarationPeriod): PeriodInfo {
  const current = periodOf(dateIso, period)
  const before = new Date(Date.parse(`${current.start}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  return periodOf(before, period)
}

export interface PeriodSummary extends PeriodInfo {
  collectedCents: number
  contributionCents: number
  incomeTaxCents: number
}

/** Chiffre d'affaires encaissé sur une période et ce qu'il faudra payer dessus. */
export function summarizePeriod(payments: Payment[], info: PeriodInfo, settings: ContributionSettings): PeriodSummary {
  const collectedCents = payments.filter((p) => p.paid_on >= info.start && p.paid_on <= info.end).reduce((s, p) => s + p.amount_cents, 0)
  return {
    ...info,
    collectedCents,
    contributionCents: percentOfCents(collectedCents, settings.ratePercent),
    incomeTaxCents: settings.liberatory ? percentOfCents(collectedCents, settings.liberatoryRatePercent) : 0,
  }
}

export interface ContributionPlan {
  /** La période en cours (le chiffre d'affaires s'y ajoute encore). */
  current: PeriodSummary
  /** La période terminée à déclarer, tant que sa date limite n'est pas passée. */
  toDeclare: PeriodSummary | null
  /** Jours restants avant la date limite de `toDeclare`. */
  daysLeft: number | null
  /** Cumul de l'année. */
  year: { collectedCents: number; contributionCents: number; incomeTaxCents: number; netCents: number }
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000)
}

export function contributionPlan(payments: Payment[], todayIso: string, settings: ContributionSettings): ContributionPlan {
  const current = summarizePeriod(payments, periodOf(todayIso, settings.period), settings)
  const previous = summarizePeriod(payments, previousPeriodOf(todayIso, settings.period), settings)
  const open = previous.deadline >= todayIso
  const yearPrefix = `${todayIso.slice(0, 4)}-`
  const collectedCents = payments.filter((p) => p.paid_on.startsWith(yearPrefix)).reduce((s, p) => s + p.amount_cents, 0)
  const contributionCents = percentOfCents(collectedCents, settings.ratePercent)
  const incomeTaxCents = settings.liberatory ? percentOfCents(collectedCents, settings.liberatoryRatePercent) : 0
  return {
    current,
    toDeclare: open ? previous : null,
    daysLeft: open ? daysBetween(todayIso, previous.deadline) : null,
    year: { collectedCents, contributionCents, incomeTaxCents, netCents: collectedCents - contributionCents - incomeTaxCents },
  }
}

export interface DeclarationDeadline {
  key: string
  /** Date limite (ISO). */
  date: string
  /** Période concernée, ex. « octobre 2026 ». */
  label: string
}

/**
 * Les prochaines dates limites de déclaration : celle de la période qui vient de se terminer (tant qu'elle n'est pas passée),
 * puis celles des périodes suivantes, `count` au total.
 */
export function upcomingDeadlines(todayIso: string, period: DeclarationPeriod, count = 4): DeclarationDeadline[] {
  const out: DeclarationDeadline[] = []
  let info = previousPeriodOf(todayIso, period)
  for (let guard = 0; out.length < count && guard < count + 3; guard++) {
    if (info.deadline >= todayIso) out.push({ key: info.key, date: info.deadline, label: info.label })
    info = periodOf(new Date(Date.parse(`${info.end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10), period)
  }
  return out
}
