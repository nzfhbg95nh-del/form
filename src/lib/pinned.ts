/** Pages épinglées en haut de la barre latérale : la liste des identifiants, dans l'ordre d'épinglage. */
export const PINNED_SETTING = 'pinned_pages'

export function parsePinned(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return [...new Set(data.filter((x): x is string => typeof x === 'string' && x !== ''))]
  } catch {
    return []
  }
}

/** Épingle (à la fin) ou désépingle une page. */
export const togglePinned = (list: string[], id: string): string[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

/** Les pages épinglées qui existent encore (ni supprimées ni disparues), dans l'ordre d'épinglage. */
export function pinnedPages<T extends { id: string; deleted_at: string | null }>(ids: string[], objects: T[]): T[] {
  const byId = new Map(objects.map((o) => [o.id, o]))
  return ids.map((id) => byId.get(id)).filter((o): o is T => !!o && !o.deleted_at)
}
