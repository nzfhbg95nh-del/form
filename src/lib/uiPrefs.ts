// Réglages rapides de l'interface (Réglages > Interface) : taille du texte et animations. Retenus sur cet ordinateur (localStorage),
// appliqués dès le démarrage. Le thème clair / sombre est géré par le store de l'appli.

export type TextSize = 'small' | 'normal' | 'large' | 'xlarge'

export const TEXT_SIZES: { id: TextSize; label: string; px: number }[] = [
  { id: 'small', label: 'Petit', px: 14 },
  { id: 'normal', label: 'Normal', px: 16 },
  { id: 'large', label: 'Grand', px: 18 },
  { id: 'xlarge', label: 'Très grand', px: 20 },
]

const SIZE_KEY = 'form-text-size'
const MOTION_KEY = 'form-reduce-motion'

export function parseTextSize(raw: string | null | undefined): TextSize {
  return TEXT_SIZES.some((s) => s.id === raw) ? (raw as TextSize) : 'normal'
}

const read = (key: string) => {
  try { return localStorage.getItem(key) } catch { return null }
}
const write = (key: string, value: string) => {
  try { localStorage.setItem(key, value) } catch { /* sans importance */ }
}

export const loadTextSize = () => parseTextSize(read(SIZE_KEY))
export const loadReduceMotion = () => read(MOTION_KEY) === '1'

/** La taille du texte change celle de tout ce qui est écrit en rem (c'est le cas de toute l'interface). */
export function applyTextSize(size: TextSize) {
  document.documentElement.style.fontSize = `${TEXT_SIZES.find((s) => s.id === size)!.px}px`
}

export function applyReduceMotion(on: boolean) {
  document.documentElement.classList.toggle('reduce-motion', on)
}

export function setTextSize(size: TextSize) {
  write(SIZE_KEY, size)
  applyTextSize(size)
}

export function setReduceMotion(on: boolean) {
  write(MOTION_KEY, on ? '1' : '0')
  applyReduceMotion(on)
}

/** À appeler une fois au démarrage. */
export function applyUiPrefs() {
  applyTextSize(loadTextSize())
  applyReduceMotion(loadReduceMotion())
}
