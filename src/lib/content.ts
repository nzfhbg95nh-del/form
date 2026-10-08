/** Convertit le contenu enregistré en liste de blocs pour l'éditeur. */
export function parseContent(content: string | null): unknown[] | undefined {
  if (!content) return undefined
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch {
    return undefined
  }
  // Format actuel : liste de blocs BlockNote.
  if (Array.isArray(data)) return data.length > 0 ? data : undefined
  // Ancien format de la phase 0 : {"text": "..."} -> un paragraphe par ligne.
  if (data && typeof data === 'object' && typeof (data as { text?: unknown }).text === 'string') {
    const text = (data as { text: string }).text
    if (text.trim() === '') return undefined
    return text.split('\n').map((line) => ({ type: 'paragraph', content: line }))
  }
  return undefined
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

interface ImageBlockLike {
  type?: string
  props?: { url?: unknown; src?: unknown }
  children?: ImageBlockLike[]
}

function findImage(blocks: ImageBlockLike[]): string | null {
  for (const b of blocks) {
    if (b && b.type === 'image' && typeof b.props?.url === 'string' && /^(data:image\/|https?:\/\/)/.test(b.props.url)) return b.props.url
    // Ancien bloc de photo de recette (v0.40.0 / v0.40.1).
    if (b && b.type === 'recipephoto' && typeof b.props?.src === 'string' && b.props.src.startsWith('data:image/')) return b.props.src
    const inner = b?.children?.length ? findImage(b.children) : null
    if (inner) return inner
  }
  return null
}

const imageCache = new Map<string, string | null>()

/**
 * La première image d'une page (celle d'un bloc image), pour l'afficher sur sa carte dans une galerie quand elle n'a pas de couverture.
 * `key` identifie la version du contenu (identifiant + date de modification) pour ne pas relire un gros contenu à chaque affichage.
 */
export function firstImageUrl(content: string | null, key?: string): string | null {
  if (!content) return null
  if (key && imageCache.has(key)) return imageCache.get(key) ?? null
  let found: string | null = null
  try {
    const data = JSON.parse(content)
    if (Array.isArray(data)) found = findImage(data as ImageBlockLike[])
  } catch {
    found = null
  }
  if (key) {
    if (imageCache.size > 500) imageCache.clear()
    imageCache.set(key, found)
  }
  return found
}
