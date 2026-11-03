// La phrase d'aide des lignes vides (« Écris tes notes ici… ») sert à découvrir l'éditeur : une fois qu'on a assez écrit, elle disparaît partout.

const KEY = 'form-hint-typed'

/** Nombre de caractères tapés dans l'éditeur après lesquels l'aide est considérée comme comprise. */
export const HINT_LEARNED_AFTER = 60

export const hintLearned = (typed: number) => typed >= HINT_LEARNED_AFTER

/** Une touche qui écrit vraiment du texte (pas Ctrl+C, pas une flèche). */
export function isTyping(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
}

export function parseTyped(raw: string | null | undefined): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

const read = () => {
  try { return parseTyped(localStorage.getItem(KEY)) } catch { return 0 }
}

let typed = -1

/** Cache l'aide (classe sur la page) quand elle a été comprise ; à appeler au démarrage et à chaque frappe. */
export function applyHint() {
  if (typed < 0) typed = read()
  document.documentElement.classList.toggle('hint-off', hintLearned(typed))
}

/** Une frappe de plus ; le total est retenu sur cet ordinateur (toutes les 5 frappes, pour ne pas écrire à chaque lettre). */
export function noteTyped() {
  if (typed < 0) typed = read()
  if (hintLearned(typed)) return
  typed += 1
  if (typed % 5 === 0 || hintLearned(typed)) {
    try { localStorage.setItem(KEY, String(typed)) } catch { /* sans importance */ }
  }
  applyHint()
}
