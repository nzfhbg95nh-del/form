/** L'historique d'un onglet : ce qu'il montrait avant (pour « Précédent ») et après (pour « Suivant »), comme dans Notion. */
export interface TabHistory {
  back: string[]
  forward: string[]
}

export interface Tabs {
  ids: string[]
  active: number
  /** Un historique par onglet, dans le même ordre que `ids` (absent tant qu'aucun onglet n'a changé de contenu). */
  history?: TabHistory[]
}

const HISTORY_LIMIT = 50

/** Un onglet peut aussi montrer un écran (Devis, Tout, Carte…) : son identifiant commence par « view: ». */
export const VIEW_TAB = 'view:'
export const isViewTab = (id: string | undefined): boolean => !!id && id.startsWith(VIEW_TAB)
/** « view:quotes » ou « view:library:map » → l'écran et, pour la bibliothèque, sa page. */
export function parseViewTab(id: string): { view: string; libPage?: string } | null {
  if (!isViewTab(id)) return null
  const [, view, libPage] = id.split(':')
  return view ? { view, libPage } : null
}
export const viewTabId = (view: string, libPage?: string): string => VIEW_TAB + view + (libPage ? ':' + libPage : '')

/** La page de l'onglet actif (rien quand l'onglet montre un écran). */
export function currentId(t: Tabs): string | null {
  const id = t.ids[t.active]
  return id && !isViewTab(id) ? id : null
}

/** Un historique pour chaque onglet (vide pour ceux qui n'en ont pas encore). */
const fullHistory = (t: Tabs): TabHistory[] => t.ids.map((_, i) => t.history?.[i] ?? { back: [], forward: [] })

/**
 * Ouvre une page ou un écran. Dans l'onglet actif (par défaut) : son contenu change et l'ancien reste dans son historique ;
 * ou dans un nouvel onglet (on rebascule sur l'onglet existant s'il y en a déjà un).
 */
export function openTab(t: Tabs, id: string, newTab = false): Tabs {
  if (t.ids.length === 0) return { ids: [id], active: 0 }
  if (newTab) {
    const existing = t.ids.indexOf(id)
    if (existing >= 0) return { ...t, active: existing }
    return { ids: [...t.ids, id], active: t.ids.length, ...(t.history ? { history: [...fullHistory(t), { back: [], forward: [] }] } : {}) }
  }
  const old = t.ids[t.active]
  if (old === id) return t
  const history = fullHistory(t)
  history[t.active] = { back: [...history[t.active].back.slice(-(HISTORY_LIMIT - 1)), old], forward: [] }
  return { ids: t.ids.map((x, i) => (i === t.active ? id : x)), active: t.active, history }
}

export function activateTab(t: Tabs, index: number): Tabs {
  return index >= 0 && index < t.ids.length ? { ...t, active: index } : t
}

export function closeTab(t: Tabs, index: number): Tabs {
  if (index < 0 || index >= t.ids.length) return t
  const ids = t.ids.filter((_, i) => i !== index)
  let active = t.active
  if (index < active) active -= 1
  else if (index === active) active = Math.min(active, ids.length - 1)
  return { ids, active: Math.max(active, 0), ...(t.history ? { history: t.history.filter((_, i) => i !== index) } : {}) }
}

/** Retire les onglets qui pointaient vers des pages supprimées. */
export function dropTabs(t: Tabs, removed: string[]): Tabs {
  let result = t
  for (let i = t.ids.length - 1; i >= 0; i--) {
    if (removed.includes(t.ids[i])) result = closeTab(result, i)
  }
  return result
}

/** Les onglets à fermer en gardant celui qui est cliqué : tous les autres, ceux de gauche ou ceux de droite. Les onglets épinglés restent toujours. */
export type CloseSide = 'others' | 'left' | 'right'

export function closeAround(t: Tabs, index: number, side: CloseSide, pinned: readonly string[] = []): { tabs: Tabs; closed: string[] } {
  if (index < 0 || index >= t.ids.length) return { tabs: t, closed: [] }
  const drop = new Set<number>()
  t.ids.forEach((id, i) => {
    if (i === index || pinned.includes(id)) return
    if (side === 'others' || (side === 'left' && i < index) || (side === 'right' && i > index)) drop.add(i)
  })
  if (drop.size === 0) return { tabs: t, closed: [] }
  const shift = (i: number) => i - [...drop].filter((d) => d < i).length
  const ids = t.ids.filter((_, i) => !drop.has(i))
  const history = t.history ? { history: t.history.filter((_, i) => !drop.has(i)) } : {}
  return { tabs: { ids, active: shift(drop.has(t.active) ? index : t.active), ...history }, closed: [...drop].sort((a, b) => a - b).map((i) => t.ids[i]) }
}

/** Dupliquer un onglet : une copie (avec son historique) juste à sa droite, qui devient l'onglet actif. */
export function duplicateTab(t: Tabs, index: number): Tabs {
  if (index < 0 || index >= t.ids.length) return t
  const ids = [...t.ids.slice(0, index + 1), t.ids[index], ...t.ids.slice(index + 1)]
  if (!t.history) return { ids, active: index + 1 }
  const own = fullHistory(t)[index]
  const copy = { back: [...own.back], forward: [...own.forward] }
  return { ids, active: index + 1, history: [...t.history.slice(0, index + 1), copy, ...t.history.slice(index + 1)] }
}

/** Épingler un onglet : il se range à gauche, après les onglets déjà épinglés (désépingler le laisse où il est). */
export function pinTab(t: Tabs, index: number, pinned: readonly string[]): { tabs: Tabs; pinned: string[] } {
  const id = t.ids[index]
  if (id === undefined) return { tabs: t, pinned: [...pinned] }
  if (pinned.includes(id)) return { tabs: t, pinned: pinned.filter((p) => p !== id) }
  const target = t.ids.filter((x) => pinned.includes(x)).length
  // On déplace l'onglet avec son historique ; l'onglet actif reste le même (on suit son numéro).
  const order = t.ids.map((_, i) => i).filter((i) => i !== index)
  order.splice(target, 0, index)
  const ids = order.map((i) => t.ids[i])
  const history = t.history ? { history: order.map((i) => t.history![i]) } : {}
  return { tabs: { ids, active: Math.max(0, order.indexOf(t.active)), ...history }, pinned: [...pinned, id] }
}

/**
 * Déplace un onglet (glisser-déposer) à sa nouvelle place 	o (son rang une fois déplacé). L'onglet actif reste le même et chaque onglet garde son historique.
 * Les onglets épinglés restent groupés à gauche : un onglet ordinaire ne passe pas devant eux, un épinglé ne sort pas de leur groupe.
 */
export function moveTab(t: Tabs, from: number, to: number, pinned: readonly string[] = []): Tabs {
  if (from < 0 || from >= t.ids.length) return t
  const pins = t.ids.filter((id) => pinned.includes(id)).length
  const isPinned = pinned.includes(t.ids[from])
  const target = isPinned ? Math.min(Math.max(to, 0), pins - 1) : Math.min(Math.max(to, pins), t.ids.length - 1)
  if (target === from) return t
  const order = t.ids.map((_, i) => i).filter((i) => i !== from)
  order.splice(target, 0, from)
  return { ids: order.map((i) => t.ids[i]), active: order.indexOf(t.active), ...(t.history ? { history: order.map((i) => t.history![i]) } : {}) }
}

/** Y a-t-il un « Précédent » ou un « Suivant » dans l'onglet actif ? */
export function canGo(t: Tabs, direction: 'back' | 'forward'): boolean {
  const h = t.history?.[t.active]
  return !!h && h[direction].length > 0
}

/**
 * « Précédent » ou « Suivant » dans l'onglet actif : il retrouve ce qu'il montrait. Les pages qui n'existent plus sont sautées
 * (`accept` dit si une page ou un écran peut encore être montré). Rien (null) s'il n'y a nulle part où aller.
 */
export function goInTab(t: Tabs, direction: 'back' | 'forward', accept: (id: string) => boolean = () => true): Tabs | null {
  const own = fullHistory(t)[t.active]
  if (!own) return null
  const from = [...own[direction === 'back' ? 'back' : 'forward']]
  const to = [...own[direction === 'back' ? 'forward' : 'back']]
  let target: string | undefined
  while (from.length > 0) {
    const candidate = from.pop() as string
    if (accept(candidate)) { target = candidate; break }
  }
  if (target === undefined) return null
  to.push(t.ids[t.active])
  const history = fullHistory(t)
  history[t.active] = direction === 'back' ? { back: from, forward: to } : { back: to, forward: from }
  return { ids: t.ids.map((x, i) => (i === t.active ? (target as string) : x)), active: t.active, history }
}
