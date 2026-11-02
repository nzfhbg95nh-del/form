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

/** Les animations : normales ou aucune. */
export type Motion = 'normal' | 'none'

export const MOTIONS: { id: Motion; label: string }[] = [
  { id: 'normal', label: 'Normales' },
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
  applyAccent(loadAccent(), document.documentElement.classList.contains('dark'))
  applyTextScale(loadTextScale())
  applyMotion(loadMotion())
}

// ───────────────────────── Couleur d'accent ─────────────────────────

export interface Accent {
  id: string
  label: string
  /** La couleur en thème clair et sa variante un peu plus claire en thème sombre. */
  light: string
  dark: string
}

export const ACCENTS: Accent[] = [
  { id: 'blue', label: 'Bleu', light: '#2383e2', dark: '#5ca8f0' },
  { id: 'violet', label: 'Violet', light: '#7c5cdb', dark: '#a58cf0' },
  { id: 'green', label: 'Vert', light: '#2f9e6f', dark: '#5ccf9a' },
  { id: 'orange', label: 'Orange', light: '#e07b2b', dark: '#f0a35c' },
  { id: 'pink', label: 'Rose', light: '#d6457f', dark: '#ef7fa9' },
  { id: 'graphite', label: 'Graphite', light: '#55595f', dark: '#aab0b7' },
]

const ACCENT_KEY = 'form-accent'

export const parseAccent = (raw: string | null | undefined): string => (ACCENTS.some((a) => a.id === raw) ? (raw as string) : 'blue')
export const loadAccent = () => parseAccent(read(ACCENT_KEY))

/** Pose la couleur d'accent sur toute l'appli (le bleu d'origine garde les couleurs du fichier de style). */
export function applyAccent(id: string, dark: boolean) {
  const root = document.documentElement
  if (id === 'blue') {
    root.style.removeProperty('--accent')
    return
  }
  const a = ACCENTS.find((x) => x.id === id) ?? ACCENTS[0]
  root.style.setProperty('--accent', dark ? a.dark : a.light)
}

export function setAccent(id: string) {
  const accent = parseAccent(id)
  write(ACCENT_KEY, accent)
  applyAccent(accent, document.documentElement.classList.contains('dark'))
}

// ───────────────────────── Moodboards ─────────────────────────

export type BoardPattern = 'dots' | 'grid' | 'none'
export type SnapStrength = 'soft' | 'normal' | 'strong'
export type BoardOpen = 'fit' | 'last'

/** Réglages par défaut des moodboards (Réglages > Interface > Moodboards). */
export interface BoardPrefs {
  /** Le fond des nouveaux moodboards : petits points, quadrillage ou uni. */
  pattern: BoardPattern
  /** La couleur du fond : « theme » (couleur de l'appli) ou une couleur #rrggbb. */
  bg: string
  /** Aimantation : les éléments s'alignent sur les autres quand on les déplace. */
  snap: boolean
  snapStrength: SnapStrength
  /** À l'ouverture : tout afficher, ou revenir là où on était. */
  open: BoardOpen
}

export const BOARD_BACKGROUNDS: { id: string; label: string }[] = [
  { id: 'theme', label: "Couleur de l'appli" },
  { id: '#ffffff', label: 'Blanc' },
  { id: '#ececea', label: 'Gris clair' },
  { id: '#2a2a2a', label: 'Gris foncé' },
  { id: '#0b0b0b', label: 'Noir' },
]

export const DEFAULT_BOARD_PREFS: BoardPrefs = { pattern: 'dots', bg: 'theme', snap: true, snapStrength: 'normal', open: 'last' }

/** Rattache une valeur lue (peut-être absente ou abîmée) à des réglages valides. */
export function parseBoardPrefs(raw: string | null | undefined): BoardPrefs {
  let data: Partial<Record<keyof BoardPrefs, unknown>> = {}
  try {
    const parsed = raw ? JSON.parse(raw) : {}
    if (parsed && typeof parsed === 'object') data = parsed
  } catch { /* réglages abîmés : valeurs de départ */ }
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback)
  return {
    pattern: pick(data.pattern, ['dots', 'grid', 'none'] as const, DEFAULT_BOARD_PREFS.pattern),
    bg: typeof data.bg === 'string' && (BOARD_BACKGROUNDS.some((b) => b.id === data.bg)) ? data.bg : DEFAULT_BOARD_PREFS.bg,
    snap: typeof data.snap === 'boolean' ? data.snap : DEFAULT_BOARD_PREFS.snap,
    snapStrength: pick(data.snapStrength, ['soft', 'normal', 'strong'] as const, DEFAULT_BOARD_PREFS.snapStrength),
    open: pick(data.open, ['fit', 'last'] as const, DEFAULT_BOARD_PREFS.open),
  }
}

const BOARD_KEY = 'form-board-prefs'
export const loadBoardPrefs = () => parseBoardPrefs(read(BOARD_KEY))
export function saveBoardPrefs(patch: Partial<BoardPrefs>): BoardPrefs {
  const next = { ...loadBoardPrefs(), ...patch }
  write(BOARD_KEY, JSON.stringify(next))
  return next
}

/** La distance (en pixels d'écran) à partir de laquelle un élément « s'accroche » aux autres. */
export const snapThreshold = (strength: SnapStrength): number => ({ soft: 3, normal: 6, strong: 12 })[strength]