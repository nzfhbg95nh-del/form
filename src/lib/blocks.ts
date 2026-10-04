/** Fonctions sur les blocs de l'éditeur (sans dépendance à l'interface, donc testables). */

interface AnyBlock {
  id?: string
  type: string
  props?: Record<string, unknown>
  content?: unknown
  children?: AnyBlock[]
}

/** Copie d'un bloc sans ses identifiants (l'éditeur en crée de nouveaux), sous-blocs compris. */
export function strippedCopy(block: AnyBlock): Omit<AnyBlock, 'id'> {
  const { id: _id, ...rest } = block
  void _id
  return {
    ...rest,
    ...(block.content !== undefined ? { content: stripContent(block.content) } : {}),
    children: (block.children ?? []).map(strippedCopy) as AnyBlock[],
  }
}

function stripContent(content: unknown): unknown {
  // Les tableaux contiennent des lignes, pas des identifiants : on les garde tels quels.
  return content
}

/** Texte brut d'un bloc (texte et mentions), sans ses sous-blocs. */
function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return (content as { text?: string; content?: unknown }[]).map((c) => (typeof c.text === 'string' ? c.text : Array.isArray(c.content) ? textOf(c.content) : '')).join('')
}

/** Nombre de mots et de caractères de toute la page. */
export function countWords(blocks: AnyBlock[]): { words: number; chars: number } {
  let words = 0
  let chars = 0
  const walk = (list: AnyBlock[]) => {
    for (const b of list) {
      const text = textOf(b.content).trim()
      if (text) {
        words += text.split(/\s+/).length
        chars += text.length
      }
      if (b.children?.length) walk(b.children)
    }
  }
  walk(blocks)
  return { words, chars }
}

/** Lien vers un bloc : `form://page/<page>#<bloc>`. */
export const blockLink = (pageId: string, blockId: string) => `form://page/${pageId}#${blockId}`

export function parseBlockLink(text: string): { pageId: string; blockId: string | null } | null {
  const m = /^form:\/\/page\/([\w-]+)(?:#([\w-]+))?$/.exec(text.trim())
  return m ? { pageId: m[1], blockId: m[2] ?? null } : null
}
