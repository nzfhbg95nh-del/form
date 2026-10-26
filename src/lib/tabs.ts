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
