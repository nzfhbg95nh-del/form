/** Réglages d'affichage d'une page (comme le menu « ⋯ » de Notion), gardés dans `properties.ui`. */
export type PageFont = 'default' | 'serif' | 'mono'

export interface PageStyle {
  font: PageFont
  /** Texte réduit. */
  small: boolean
  /** Pleine largeur. */
  wide: boolean
  /** Page verrouillée : lecture seule. */
  locked: boolean
}

export const DEFAULT_PAGE_STYLE: PageStyle = { font: 'default', small: false, wide: false, locked: false }

const FONTS: PageFont[] = ['default', 'serif', 'mono']

function parseObject(properties: string | null | undefined): Record<string, unknown> {
  try {
    const data = JSON.parse(properties || '{}')
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function parsePageStyle(properties: string | null | undefined): PageStyle {
  const ui = parseObject(properties).ui
  const u = ui && typeof ui === 'object' ? (ui as Record<string, unknown>) : {}
  return {
    font: FONTS.includes(u.font as PageFont) ? (u.font as PageFont) : 'default',
    small: u.small === true,
    wide: u.wide === true,
    locked: u.locked === true,
  }
}

/** Renvoie les `properties` mises à jour, sans toucher aux autres clés. */
export function withPageStyle(properties: string | null | undefined, patch: Partial<PageStyle>): string {
  const data = parseObject(properties)
  const next = { ...parsePageStyle(properties), ...patch }
  const isDefault = next.font === 'default' && !next.small && !next.wide && !next.locked
  if (isDefault) delete data.ui
  else data.ui = next
  return JSON.stringify(data)
}

/** Nom de fichier sûr pour l'export d'une page. */
export function exportFileName(title: string, extension: string): string {
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return `${base || 'Sans titre'}.${extension}`
}
