export interface Tabs {
  ids: string[]
  active: number
}

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

/** Ouvre une page : dans l'onglet actif, ou dans un nouvel onglet (on rebascule sur l'onglet existant s'il y en a déjà un). */
export function openTab(t: Tabs, id: string, newTab = false): Tabs {
  if (t.ids.length === 0) return { ids: [id], active: 0 }
  if (newTab) {
    const existing = t.ids.indexOf(id)
    if (existing >= 0) return { ids: t.ids, active: existing }
    return { ids: [...t.ids, id], active: t.ids.length }
  }
  return { ids: t.ids.map((x, i) => (i === t.active ? id : x)), active: t.active }
}

export function activateTab(t: Tabs, index: number): Tabs {
  return index >= 0 && index < t.ids.length ? { ids: t.ids, active: index } : t
}

export function closeTab(t: Tabs, index: number): Tabs {
  if (index < 0 || index >= t.ids.length) return t
  const ids = t.ids.filter((_, i) => i !== index)
  let active = t.active
  if (index < active) active -= 1
  else if (index === active) active = Math.min(active, ids.length - 1)
  return { ids, active: Math.max(active, 0) }
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
  return { tabs: { ids, active: shift(drop.has(t.active) ? index : t.active) }, closed: [...drop].sort((a, b) => a - b).map((i) => t.ids[i]) }
}

/** Dupliquer un onglet : une copie juste à sa droite, qui devient l'onglet actif. */
export function duplicateTab(t: Tabs, index: number): Tabs {
  if (index < 0 || index >= t.ids.length) return t
  const ids = [...t.ids.slice(0, index + 1), t.ids[index], ...t.ids.slice(index + 1)]
  return { ids, active: index + 1 }
}

/** Épingler un onglet : il se range à gauche, après les onglets déjà épinglés (désépingler le laisse où il est). */
export function pinTab(t: Tabs, index: number, pinned: readonly string[]): { tabs: Tabs; pinned: string[] } {
  const id = t.ids[index]
  if (id === undefined) return { tabs: t, pinned: [...pinned] }
  if (pinned.includes(id)) return { tabs: t, pinned: pinned.filter((p) => p !== id) }
  const target = t.ids.filter((x) => pinned.includes(x)).length
  const activeId = t.ids[t.active]
  const ids = [...t.ids.slice(0, index), ...t.ids.slice(index + 1)]
  ids.splice(target, 0, id)
  return { tabs: { ids, active: Math.max(0, ids.indexOf(activeId)) }, pinned: [...pinned, id] }
}