import type { ObjectRow } from './types'

/** Minuscules et sans accents, caractère par caractère (la longueur du texte est conservée). */
export function normalize(text: string): string {
  return Array.from(text)
    .map((c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase())
    .join('')
}

/** Tout le texte d'une page (blocs de l'éditeur), à plat. */
export function extractText(content: string | null): string {
  if (!content) return ''
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch {
    return ''
  }
  const parts: string[] = []
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk)
    else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (key === 'text' && typeof value === 'string') parts.push(value)
        else if (key !== 'props' && key !== 'id' && key !== 'type') walk(value)
      }
    }
    // Les blocs dont « content » est une simple chaîne (modèles de pages) :
    if (typeof node === 'object' && node && !Array.isArray(node) && typeof (node as { content?: unknown }).content === 'string') {
      parts.push((node as { content: string }).content)
    }
  }
  walk(data)
  return parts.join(' ')
}

export interface SearchHit {
  object: ObjectRow
  score: number
  snippet: string | null
  /** Titres des pages parentes, de la racine vers le parent direct. */
  path: string[]
}

function pathOf(objects: ObjectRow[], o: ObjectRow): string[] {
  const path: string[] = []
  const seen = new Set<string>()
  for (let p = objects.find((x) => x.id === o.parent_id); p && !seen.has(p.id); p = objects.find((x) => x.id === p!.parent_id)) {
    seen.add(p.id)
    path.unshift(p.title || 'Sans titre')
  }
  return path
}

function makeSnippet(text: string, tokens: string[]): string {
  const norm = normalize(text)
  const index = Math.min(...tokens.map((t) => norm.indexOf(t)).filter((i) => i >= 0))
  const start = Math.max(0, index - 30)
  const piece = text.slice(start, index + 70).replace(/\s+/g, ' ').trim()
  return (start > 0 ? '… ' : '') + piece + (index + 70 < text.length ? ' …' : '')
}

/** Recherche dans les titres et dans le contenu. Tous les mots tapés doivent être présents. */
export function searchObjects(objects: ObjectRow[], query: string, limit = 30): SearchHit[] {
  const q = normalize(query).trim()
  const live = objects.filter((o) => !o.deleted_at && (o.type === 'page' || o.type === 'database' || o.type === 'row'))

  if (q === '') {
    return [...live]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 8)
      .map((object) => ({ object, score: 0, snippet: null, path: pathOf(objects, object) }))
  }

  const tokens = q.split(/\s+/)
  const hits: SearchHit[] = []
  for (const object of live) {
    const title = normalize(object.title)
    const body = extractText(object.content)
    const haystack = `${title} ${normalize(body)}`
    if (!tokens.every((t) => haystack.includes(t))) continue

    let score = 10
    let snippet: string | null = null
    if (title.startsWith(q)) score = 120
    else if (title.includes(q)) score = 100
    else if (tokens.every((t) => title.includes(t))) score = 60
    else snippet = makeSnippet(body, tokens)
    hits.push({ object, score, snippet, path: pathOf(objects, object) })
  }
  return hits
    .sort((a, b) => b.score - a.score || b.object.updated_at.localeCompare(a.object.updated_at))
    .slice(0, limit)
}
