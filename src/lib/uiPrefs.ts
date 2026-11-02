// Réglages rapides de l'interface (Réglages > Interface) : taille du texte et animations. Retenus sur cet ordinateur (localStorage),
// appliqués dès le démarrage. Le thème clair / sombre est géré par le store de l'appli.

/** Taille du texte en pourcentage de la taille normale (16 px). */
export const TEXT_SCALE_MIN = 80
export const TEXT_SCALE_MAX = 140
export const TEXT_SCALE_STEP = 5
export const TEXT_SCALE_DEFAULT = 100

const SCALE_KEY = 'form-text-scale'
const MOTION_KEY = 'form-reduce-motion'

/** Un pourcentage valide (entre 80 et 140, arrondi au pas de 5), sinon 100. */
export function parseTextScale(raw: string | number | null | undefined): number {
  const n = Number(raw)
  if (raw === null || raw === undefined || raw === '' || !Number.isFinite(n)) return TEXT_SCALE_DEFAULT
  const stepped = Math.round(n / TEXT_SCALE_STEP) * TEXT_SCALE_STEP
  return Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, stepped))
}

/** La taille de base en pixels pour ce pourcentage (16 px = 100 %). */
export const textScaleToPx = (scale: number) => (16 * parseTextScale(scale)) / 100

const read = (key: string) => {
  try { return localStorage.getItem(key) } catch { return null }
}
const write = (key: string, value: string) => {
  try { localStorage.setItem(key, value) } catch { /* sans importance */ }
}

export const loadTextScale = () => parseTextScale(read(SCALE_KEY))
export const loadReduceMotion = () => read(MOTION_KEY) === '1'

/** La taille de base change celle de tout ce qui est écrit en rem (c'est le cas de toute l'interface). */
export function applyTextScale(scale: number) {
  document.documentElement.style.fontSize = `${textScaleToPx(scale)}px`
}

export function applyReduceMotion(on: boolean) {
  document.documentElement.classList.toggle('reduce-motion', on)
}

export function setTextScale(scale: number) {
  const s = parseTextScale(scale)
  write(SCALE_KEY, String(s))
  applyTextScale(s)
}

export function setReduceMotion(on: boolean) {
  write(MOTION_KEY, on ? '1' : '0')
  applyReduceMotion(on)
}

/** À appeler une fois au démarrage. */
export function applyUiPrefs() {
  applyTextScale(loadTextScale())
  applyReduceMotion(loadReduceMotion())
}
