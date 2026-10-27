// Ce qu'on lit dans le contenu d'une page pour le plan, les retours liens et l'aperçu d'une page : logique pure, testée automatiquement.

import { parseContent } from './content'
import type { ObjectRow } from './types'

export interface Heading { id: string; level: number; text: string }

type Block = { id?: string; type?: string; props?: { level?: number; pageId?: string }; content?: unknown; children?: unknown[] }

const textOf = (content: unknown): string =>
  Array.isArray(content)
    ? (content as { text?: string; content?: unknown }[]).map((c) => c.text ?? (Array.isArray(c.content) ? textOf(c.content) : '')).join('')
    : ''

/** Les titres d'une liste de blocs, dans l'ordre (niveau 1 à 4). */
export function headingsOf(blocks: unknown[] | undefined, out: Heading[] = []): Heading[] {
  for (const b of (blocks ?? []) as Block[]) {
    if (b.type === 'heading' && b.id) {
      const text = textOf(b.content).trim()
      if (text) out.push({ id: b.id, level: Math.min(b.props?.level ?? 1, 4), text })
    }
    if (b.children?.length) headingsOf(b.children, out)
  }
  return out
}

/** Les titres du contenu enregistré d'une page. */
export const pageHeadings = (content: string | null): Heading[] => headingsOf(parseContent(content))

/** Les pages qui citent `pageId` (par un @ ou par un bloc « Page » ou « Carte de page »), sans elle-même, les plus récentes d'abord. */
export function backlinksTo(objects: readonly ObjectRow[], pageId: string): ObjectRow[] {
  const needle = `"pageId":"${pageId}"`
  return objects
    .filter((o) => o.id !== pageId && !o.deleted_at && (o.type === 'page' || o.type === 'row') && o.content !== null && o.content.includes(needle))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
}

/** Les premiers mots du texte d'une page (pour la carte d'aperçu). */
export function excerptOf(content: string | null, max = 160): string {
  const parts: string[] = []
  const walk = (blocks: unknown[] | undefined) => {
    for (const b of (blocks ?? []) as Block[]) {
      const t = textOf(b.content).trim()
      if (t) parts.push(t)
      if (b.children?.length) walk(b.children)
    }
  }
  walk(parseContent(content))
  const text = parts.join(' · ')
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}
