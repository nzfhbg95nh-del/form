export interface Tabs {
  ids: string[]
  active: number
}

export function currentId(t: Tabs): string | null {
  return t.ids[t.active] ?? null
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
