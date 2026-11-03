// Le menu d'un bloc « façon Notion » : les types dans lesquels on peut transformer un bloc, et les couleurs. Logique pure (testée).

export type ColorId = 'default' | 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red'

export const COLOR_IDS: ColorId[] = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']

const COLOR_NAMES: Record<ColorId, string> = {
  default: 'par défaut', gray: 'gris', brown: 'marron', orange: 'orange', yellow: 'jaune', green: 'vert', blue: 'bleu', purple: 'violet', pink: 'rose', red: 'rouge',
}

/** La couleur des lettres « A » montrées dans le menu, et celle des carrés de fond. */
export const TEXT_INK: Record<ColorId, string> = {
  default: 'var(--fg)', gray: '#787774', brown: '#9f6b53', orange: '#d9730d', yellow: '#cb912f', green: '#448361', blue: '#337ea9', purple: '#9065b0', pink: '#c14c8a', red: '#d44c47',
}
export const BACKGROUND_FILL: Record<ColorId, string> = {
  default: 'transparent', gray: '#f1f1ef', brown: '#f4eeee', orange: '#fbecdd', yellow: '#fbf3db', green: '#edf3ec', blue: '#e7f3f8', purple: '#f6f3f9', pink: '#faf1f5', red: '#fdebec',
}

export type ColorKind = 'text' | 'background'

export const colorLabel = (kind: ColorKind, id: ColorId) => `${kind === 'text' ? 'Texte' : 'Fond'} ${COLOR_NAMES[id]}`
/** Le nom de la propriété du bloc qui porte cette couleur. */
export const colorProp = (kind: ColorKind) => (kind === 'text' ? 'textColor' : 'backgroundColor')

export interface RecentColor {
  kind: ColorKind
  color: ColorId
}

export const DEFAULT_RECENT: RecentColor = { kind: 'background', color: 'default' }

/** La dernière couleur utilisée, lue dans les réglages (valeur absente ou abîmée : « fond par défaut »). */
export function parseRecentColor(raw: string | null | undefined): RecentColor {
  try {
    const data = raw ? JSON.parse(raw) : null
    if (data && (data.kind === 'text' || data.kind === 'background') && COLOR_IDS.includes(data.color)) return { kind: data.kind, color: data.color }
  } catch { /* abîmé */ }
  return DEFAULT_RECENT
}

/** Ctrl+Maj+H : applique la dernière couleur utilisée ; si le bloc l'a déjà, il revient à la couleur par défaut. */
export function nextColor(current: string | undefined, recent: RecentColor): ColorId {
  if (recent.color === 'default') return 'default'
  return current === recent.color ? 'default' : recent.color
}

// ───────────────────────── Transformer en ─────────────────────────

export interface Kind {
  id: string
  label: string
  type: string
  props?: Record<string, unknown>
}

/** Les types proposés dans « Transformer en », dans l'ordre du menu. */
export const KINDS: Kind[] = [
  { id: 'text', label: 'Texte', type: 'paragraph' },
  { id: 'h1', label: 'Titre 1', type: 'heading', props: { level: 1, isToggleable: false } },
  { id: 'h2', label: 'Titre 2', type: 'heading', props: { level: 2, isToggleable: false } },
  { id: 'h3', label: 'Titre 3', type: 'heading', props: { level: 3, isToggleable: false } },
  { id: 'h4', label: 'Titre 4', type: 'heading', props: { level: 4, isToggleable: false } },
  { id: 'bullet', label: 'Liste à puces', type: 'bulletListItem' },
  { id: 'numbered', label: 'Liste numérotée', type: 'numberedListItem' },
  { id: 'check', label: 'Liste de tâches', type: 'checkListItem' },
  { id: 'todo', label: 'Tâche avec statut', type: 'todo' },
  { id: 'toggle', label: 'Menu déroulant', type: 'toggleListItem' },
  { id: 'code', label: 'Code', type: 'codeBlock' },
  { id: 'quote', label: 'Citation', type: 'quote' },
  { id: 'callout', label: 'Encadré', type: 'callout' },
  { id: 'th1', label: 'Titre déroulant 1', type: 'heading', props: { level: 1, isToggleable: true } },
  { id: 'th2', label: 'Titre déroulant 2', type: 'heading', props: { level: 2, isToggleable: true } },
  { id: 'th3', label: 'Titre déroulant 3', type: 'heading', props: { level: 3, isToggleable: true } },
  { id: 'th4', label: 'Titre déroulant 4', type: 'heading', props: { level: 4, isToggleable: true } },
]

/** Le type d'un bloc, parmi ceux de `KINDS` (ou null pour une image, un tableau, un moodboard…). */
export function kindOf(block: { type: string; props?: Record<string, unknown> }): Kind | null {
  const level = Number(block.props?.level ?? 1)
  const toggle = Boolean(block.props?.isToggleable)
  return KINDS.find((k) => k.type === block.type && (block.type !== 'heading' || (Number(k.props?.level) === level && Boolean(k.props?.isToggleable) === toggle))) ?? null
}

const RECENT_KEY = 'form-block-color-recent'

/** La dernière couleur appliquée à un bloc (gardée sur cet ordinateur). */
export function loadRecentColor(): RecentColor {
  try {
    return parseRecentColor(localStorage.getItem(RECENT_KEY))
  } catch {
    return DEFAULT_RECENT
  }
}

export function saveRecentColor(recent: RecentColor) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
  } catch { /* sans importance */ }
}
