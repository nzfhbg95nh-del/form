/**
 * Quand la bibliothèque se met à jour toute seule (Réglages > Bibliothèque) : jamais, à chaque démarrage de Form,
 * une fois par jour, par semaine ou par mois. Le « jour » est le jour du calendrier de Victor, pas un délai de 24 h.
 */
export type AutoFrequency = 'never' | 'startup' | 'daily' | 'weekly' | 'monthly'

export const AUTO_FREQUENCIES: { id: AutoFrequency; label: string }[] = [
  { id: 'never', label: 'Jamais (seulement avec le bouton)' },
  { id: 'startup', label: 'À chaque démarrage de Form' },
  { id: 'daily', label: 'Une fois par jour' },
  { id: 'weekly', label: 'Une fois par semaine' },
  { id: 'monthly', label: 'Une fois par mois' },
]

/** Le téléchargement des nouveaux enregistrements a son propre rythme : jamais, par jour, par semaine ou par mois (pas « à chaque démarrage »). */
export const DOWNLOAD_FREQUENCIES = AUTO_FREQUENCIES.filter((f) => f.id !== 'startup')

/** Lit le rythme enregistré ; l'ancienne case « télécharger aussi » cochée vaut « une fois par semaine ». Sans rien : jamais. */
export function parseDownloadFrequency(frequency: string | null | undefined, legacySwitch: string | null | undefined): AutoFrequency {
  if (DOWNLOAD_FREQUENCIES.some((f) => f.id === frequency)) return frequency as AutoFrequency
  return legacySwitch === '1' ? 'weekly' : 'never'
}

/** Jours qui doivent s'écouler depuis la dernière mise à jour automatique. */
const MIN_DAYS: Record<'daily' | 'weekly' | 'monthly', number> = { daily: 1, weekly: 7, monthly: 30 }

/** Lit le réglage enregistré. Sans réglage récent, on reprend l'ancien interrupteur « au démarrage » (coupé = jamais). */
export function parseFrequency(frequency: string | null | undefined, legacySwitch: string | null | undefined): AutoFrequency {
  if (AUTO_FREQUENCIES.some((f) => f.id === frequency)) return frequency as AutoFrequency
  return legacySwitch === '0' ? 'never' : 'startup'
}

/** « AAAA-MM-JJ » de la date locale. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const dayNumber = (key: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  return m ? Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000) : null
}

/** Faut-il lancer la mise à jour maintenant ? `lastDay` : jour de la dernière mise à jour automatique terminée (« AAAA-MM-JJ »), ou vide. */
export function shouldAutoUpdate(frequency: AutoFrequency, lastDay: string | null | undefined, now: Date): boolean {
  if (frequency === 'never') return false
  if (frequency === 'startup') return true
  const last = lastDay ? dayNumber(lastDay) : null
  // Jamais faite, ou date illisible : on la fait.
  if (last === null) return true
  const today = dayNumber(dayKey(now))!
  // Une horloge réglée en arrière ne bloque pas les mises à jour : on repart de zéro.
  if (today < last) return true
  return today - last >= MIN_DAYS[frequency]
}
