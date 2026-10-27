// Raccourcis de date de l'éditeur (« /aujourd'hui », « /demain »…). Logique pure, testée automatiquement.

/** « 27 octobre 2026 », décalée de `offsetDays` jours (−1 : hier, +1 : demain). */
export function dateText(now: Date, offsetDays = 0): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** « 27 octobre 2026, 14:05 ». */
export function dateTimeText(now: Date): string {
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${dateText(now)}, ${hh}:${mm}`
}
