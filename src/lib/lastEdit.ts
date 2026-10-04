const pad = (n: number) => String(n).padStart(2, '0')
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** « à l'instant », « il y a 5 min », « aujourd'hui à 14:03 », « hier à 00:53 » ou « le 3 oct. 2026 ». */
export function lastEditText(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const minutes = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (sameDay(d, now)) return `aujourd’hui à ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return `hier à ${time}`
  return `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

/** Titre affiché : une page sans titre s'appelle « Nouvelle page », comme dans Notion. */
export const displayTitle = (title: string | null | undefined) => (title ?? '').trim() || 'Nouvelle page'
