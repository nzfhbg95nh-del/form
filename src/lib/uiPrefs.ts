// Réglages rapides de l'interface (Réglages > Interface) : taille du texte et animations. Retenus sur cet ordinateur (localStorage),
// appliqués dès le démarrage. Le thème clair / sombre est géré par le store de l'appli.

/** Taille du texte en pourcentage de la taille normale (16 px). */
export const TEXT_SCALE_MIN = 80
export const TEXT_SCALE_MAX = 140
export const TEXT_SCALE_STEP = 5
export const TEXT_SCALE_DEFAULT = 100

const SCALE_KEY = 'form-text-scale'
const MOTION_KEY = 'form-motion'

/** Les quatre tailles proposées dans les Réglages. */
export const TEXT_SIZES = [
  { scale: 85, label: 'Petit' },
  { scale: 100, label: 'Normal' },
  { scale: 115, label: 'Grand' },
  { scale: 130, label: 'Très grand' },
] as const

/** La taille proposée la plus proche d'un pourcentage retenu (par exemple 110 → 115). */
export function nearestTextSize(scale: number): number {
  return TEXT_SIZES.reduce((best, s) => (Math.abs(s.scale - scale) < Math.abs(best - scale) ? s.scale : best), 100 as number)
}

/** Le niveau d'animations : normales, réduites (plus courtes) ou aucune. */
export type Motion = 'normal' | 'reduced' | 'none'

export const MOTIONS: { id: Motion; label: string }[] = [
  { id: 'normal', label: 'Normales' },
  { id: 'reduced', label: 'Réduites' },
  { id: 'none', label: 'Aucune' },
]

export function parseMotion(raw: string | null | undefined): Motion {
  return MOTIONS.some((m) => m.id === raw) ? (raw as Motion) : 'normal'
}

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
export const loadMotion = () => parseMotion(read(MOTION_KEY))

/** La taille de base change celle de tout ce qui est écrit en rem (c'est le cas de toute l'interface). */
export function applyTextScale(scale: number) {
  document.documentElement.style.fontSize = `${textScaleToPx(scale)}px`
}

export function applyMotion(level: Motion) {
  const root = document.documentElement.classList
  root.toggle('motion-reduced', level === 'reduced')
  root.toggle('motion-none', level === 'none')
}

export function setTextScale(scale: number) {
  const s = parseTextScale(scale)
  write(SCALE_KEY, String(s))
  applyTextScale(s)
}

export function setMotion(level: Motion) {
  write(MOTION_KEY, level)
  applyMotion(level)
}

/** À appeler une fois au démarrage. */
export function applyUiPrefs() {
  applyTextScale(loadTextScale())
  applyMotion(loadMotion())
}
