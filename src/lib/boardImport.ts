// Moodboard : ajouter les images d'un lien Pinterest (un tableau ou une épingle) ou Instagram (un post). Ici : quels liens sont acceptés et comment on les lit.
// Le téléchargement lui-même est fait par le programme (voir `saver.rs`, commandes `link_fetch` et `link_cleanup`).

export type LinkSite = 'pinterest' | 'instagram'

export interface LinkInfo {
  site: LinkSite
  kind: 'board' | 'pin' | 'post'
  /** L'adresse nettoyée (sans suite de paramètres). */
  url: string
}

/** Au plus ce nombre d'images par import : chaque image alourdit la base de Form (de l'ordre d'un demi à un mégaoctet). */
export const IMPORT_LIMIT = 100

const NOT_BOARD = new Set(['pin', 'ideas', 'search', 'today', 'business', 'settings', 'following', 'login', 'explore'])

/** Reconnaît un lien de tableau Pinterest, d'épingle Pinterest ou de post Instagram ; sinon dit pourquoi en français simple. */
export function classifyLink(text: string): { info: LinkInfo | null; problem: string | null } {
  let raw = text.trim()
  if (!raw) return { info: null, problem: 'Colle un lien Pinterest ou Instagram.' }
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { info: null, problem: "Ce lien n'est pas lisible : copie l'adresse complète depuis ton navigateur." }
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  const parts = u.pathname.split('/').filter(Boolean)
  if (host === 'pin.it') return parts.length > 0 ? { info: { site: 'pinterest', kind: 'pin', url: `https://pin.it/${parts[0]}` }, problem: null } : { info: null, problem: 'Lien Pinterest incomplet.' }
  if (/^([a-z]{2}\.)?pinterest\.[a-z.]+$/.test(host)) {
    if (parts[0] === 'pin' && parts[1]) return { info: { site: 'pinterest', kind: 'pin', url: `https://www.pinterest.com/pin/${parts[1]}/` }, problem: null }
    if (parts.length >= 2 && !NOT_BOARD.has(parts[0])) {
      return { info: { site: 'pinterest', kind: 'board', url: `https://www.pinterest.com/${parts[0]}/${parts[1]}/` }, problem: null }
    }
    return { info: null, problem: "Donne le lien d'un tableau précis (par exemple pinterest.com/pseudo/nom-du-tableau/) ou d'une épingle, pas celui d'un profil entier." }
  }
  if (host === 'instagram.com') {
    if ((parts[0] === 'p') && parts[1]) return { info: { site: 'instagram', kind: 'post', url: `https://www.instagram.com/p/${parts[1]}/` }, problem: null }
    if ((parts[0] === 'reel' || parts[0] === 'reels' || parts[0] === 'tv') && parts[1]) {
      return { info: null, problem: 'Les vidéos ne sont pas ajoutées au moodboard : donne le lien d\'un post avec des images.' }
    }
    return { info: null, problem: "Donne le lien d'un post Instagram (instagram.com/p/…), pas celui d'un profil." }
  }
  return { info: null, problem: 'Seuls les liens Pinterest et Instagram sont pris en charge.' }
}

const IMAGE_TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp' }

/** Le type d'image d'un fichier d'après son nom, ou rien si ce n'est pas une image que la toile sait lire. */
export function imageTypeOf(path: string): string | null {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase()
  return ext ? (IMAGE_TYPES[ext] ?? null) : null
}

/** Le message de fin d'import. */
export function importMessage(added: number, skipped: number, limit = IMPORT_LIMIT): string {
  if (added === 0) return skipped > 0 ? 'Aucune image lisible dans ce lien.' : 'Rien à ajouter.'
  const base = `${added} image${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''}`
  const extra = [skipped > 0 ? `${skipped} fichier${skipped > 1 ? 's' : ''} ignoré${skipped > 1 ? 's' : ''}` : '', added >= limit ? `limite de ${limit} atteinte` : ''].filter(Boolean)
  return extra.length > 0 ? `${base} (${extra.join(', ')}).` : `${base}.`
}
