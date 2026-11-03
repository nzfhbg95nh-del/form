// Chercher dans la page (Ctrl+F) : la partie sans interface (testée). Majuscules et accents sont ignorés ; les positions restent celles du texte d'origine.

/** Une lettre sans accent ni majuscule, toujours une seule lettre (pour que les positions ne bougent pas). */
export function foldChar(ch: string): string {
  const base = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  return base.length === 1 ? base : ch.toLowerCase().length === 1 ? ch.toLowerCase() : ch
}

export const foldText = (s: string) => Array.from(s).map(foldChar).join('')

/** Les positions (dans `text`) où commence `needle`, sans chevauchement. Un mot vide ne trouve rien. */
export function findAll(text: string, needle: string): number[] {
  if (!needle) return []
  const hay = foldText(text)
  const n = foldText(needle)
  if (hay.length !== text.length || n.length !== needle.length) return findAllSimple(text.toLowerCase(), needle.toLowerCase())
  return findAllSimple(hay, n)
}

function findAllSimple(hay: string, n: string): number[] {
  const out: number[] = []
  let from = 0
  for (;;) {
    const i = hay.indexOf(n, from)
    if (i < 0) return out
    out.push(i)
    from = i + n.length
  }
}

/** Le numéro suivant (ou précédent) dans une boucle de `count` résultats. */
export const stepIndex = (current: number, count: number, dir: 1 | -1) => (count === 0 ? 0 : (current + dir + count) % count)