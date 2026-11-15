// Un dossier posé dans « images ajoutées » (Art graphique, Architecture…) doit ranger ses images dans le tableau du même nom,
// pas créer une collection de plus. Ici : retrouver ce tableau à partir du nom du dossier (sans accents ni majuscules,
// et « Art graphique » retrouve « Art graphic »).

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const wordsOf = (s: string) => norm(s).split(' ').filter(Boolean)

/** Deux mots pareils, ou presque : même début d'au moins 4 lettres, sauf la dernière (graphique / graphic, photo / photography). */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  const m = Math.min(a.length, b.length)
  if (m < 4) return false
  let i = 0
  while (i < m && a[i] === b[i]) i++
  return i >= Math.max(4, m - 1)
}

/** Les mots de `short` sont, dans l'ordre, les premiers mots de `long`. */
const startsWithWords = (long: string[], short: string[]) => short.length > 0 && short.length <= long.length && short.every((w, i) => sameWord(w, long[i]))

/** Début de l'identifiant des collections créées pour les dossiers de « images ajoutées ». */
export const FOLDER_PREFIX = 'man:ajouts/'

/** Une collection de dossier de premier niveau (man:ajouts/Art graphique), pas un sous-dossier. */
export const isFolderCollectionId = (id: string) => id.startsWith(FOLDER_PREFIX) && !id.slice(FOLDER_PREFIX.length).includes('/')

/**
 * Le tableau qui correspond au nom d'un dossier : le même nom, sinon un nom qui commence pareil (mots presque identiques),
 * à condition qu'il n'y en ait qu'un. Rien si on hésite : le dossier reste alors une collection à part.
 */
export function matchBoard(folder: string, boards: readonly { id: string; name: string }[]): string | null {
  const f = wordsOf(folder)
  if (f.join(' ').length < 2) return null
  const named = boards.map((b) => ({ id: b.id, w: wordsOf(b.name) }))
  const exact = named.filter((b) => b.w.join(' ') === f.join(' '))
  if (exact.length === 1) return exact[0].id
  if (exact.length > 1) return null
  const close = named.filter((b) => startsWithWords(b.w, f) || startsWithWords(f, b.w))
  return close.length === 1 ? close[0].id : null
}
