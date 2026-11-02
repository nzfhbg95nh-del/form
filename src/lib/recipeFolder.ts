/**
 * Une recette dans le dossier « recette » de la bibliothèque : un dossier par recette, avec
 *   recette.json   la recette complète (c'est lui que Form relit pour reprendre ses recettes sur un autre ordinateur),
 *   recette.md     la même recette, lisible dans n'importe quel éditeur de texte,
 *   photo-1.jpg…   ses photos.
 * Dans la base, une photo rangée dans ce dossier s'écrit « form-lib:recette/<dossier>/photo-1.jpg » (chemin À L'INTÉRIEUR de la
 * bibliothèque, qui ne change pas quand on déplace le dossier). Dans recette.json, elle s'écrit simplement « photo-1.jpg ».
 */
import { libraryRel, parseDataImage, toLibraryUrl } from './libraryImages'
import { RECIPE } from './recipes'

export const RECIPE_FOLDER = 'recette'
export const FILE_FORMAT = 'form-recette'

/** Nom du dossier d'une recette : son titre (sans les caractères interdits par Windows, 60 caractères au plus) puis un morceau de son identifiant. */
export function recipeDirName(title: string, id: string): string {
  const clean = title
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .replace(/^[.\s]+|[.\s]+$/g, '')
  const short = id.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'recette'
  return `${clean || 'Recette'} [${short}]`
}

interface BlockLike {
  type?: string
  props?: Record<string, unknown>
  content?: unknown
  children?: unknown
}

/** Parcourt les blocs (et leurs enfants) dans l'ordre de la page. */
function eachBlock(blocks: unknown, visit: (b: BlockLike) => void) {
  if (!Array.isArray(blocks)) return
  for (const b of blocks as BlockLike[]) {
    if (b && typeof b === 'object') {
      visit(b)
      eachBlock(b.children, visit)
    }
  }
}

export interface PhotoPlan {
  name: string
  /** Contenu à écrire ; rien si la photo est déjà dans le dossier de la recette. */
  base64: string | null
}

export interface RecipePlan {
  dir: string
  /** Les blocs à garder dans la base : les photos rangées pointent vers le dossier (« form-lib:… »). */
  dbBlocks: unknown[]
  /** Les blocs écrits dans recette.json : les photos y sont de simples noms de fichier. */
  fileBlocks: unknown[]
  photos: PhotoPlan[]
  /** Des photos étaient dans la base : la page de la base va être réécrite pour pointer vers le dossier. */
  changedDb: boolean
}

/** Prépare le rangement d'une recette : le dossier, les photos à écrire et les deux versions des blocs. Les blocs reçus ne sont pas modifiés. */
export function planRecipe(title: string, id: string, blocks: unknown[]): RecipePlan {
  const dir = recipeDirName(title, id)
  const dbBlocks = structuredClone(blocks)
  const fileBlocks = structuredClone(blocks)
  const photos: PhotoPlan[] = []
  let changedDb = false
  const own = `${RECIPE_FOLDER}/${dir}/`

  const dbImages: BlockLike[] = []
  const fileImages: BlockLike[] = []
  eachBlock(dbBlocks, (b) => b.type === 'image' && dbImages.push(b))
  eachBlock(fileBlocks, (b) => b.type === 'image' && fileImages.push(b))

  dbImages.forEach((db, i) => {
    const file = fileImages[i]
    const url = db.props?.url
    const image = parseDataImage(url)
    const rel = typeof url === 'string' ? libraryRel(url) : null
    if (image) {
      const name = `photo-${i + 1}.${image.ext}`
      photos.push({ name, base64: image.base64 })
      db.props = { ...db.props, url: toLibraryUrl(`${own}${name}`) }
      file.props = { ...file.props, url: name }
      changedDb = true
    } else if (rel && rel.startsWith(own)) {
      file.props = { ...file.props, url: rel.slice(own.length) }
    }
  })
  return { dir, dbBlocks, fileBlocks, photos, changedDb }
}

const textOf = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return (content as { text?: unknown; content?: unknown }[]).map((c) => (typeof c.text === 'string' ? c.text : c.content !== undefined ? textOf(c.content) : '')).join('')
}

const SKIPPED = new Set(['portions', 'recipephoto', 'divider'])

/** La recette en texte simple (Markdown), à partir des blocs « fichier » (les photos y sont des noms de fichier). */
export function recipeMarkdown(title: string, values: Record<string, unknown>, fileBlocks: unknown[]): string {
  const out: string[] = [`# ${title.trim() || 'Recette'}`, '']
  const servings = Number(values[RECIPE.servings])
  const prep = Number(values[RECIPE.prep])
  const source = String(values[RECIPE.source] ?? '').trim()
  const meta = [Number.isFinite(servings) && servings > 0 ? `Pour ${servings} personne${servings > 1 ? 's' : ''}` : '', Number.isFinite(prep) && prep > 0 ? `Préparation : ${prep} min` : '', source ? `Source : ${source}` : ''].filter(Boolean)
  if (meta.length > 0) out.push(meta.join(' · '), '')

  const walk = (blocks: unknown, depth: number) => {
    if (!Array.isArray(blocks)) return
    const pad = '  '.repeat(depth)
    let n = 0
    for (const b of blocks as BlockLike[]) {
      const type = b?.type ?? ''
      n = type === 'numberedListItem' ? n + 1 : 0
      if (SKIPPED.has(type)) continue
      const text = textOf(b.content).trim()
      if (type === 'heading') {
        const level = Math.min(6, Math.max(1, Number(b.props?.level) || 2) + 1)
        out.push('', `${'#'.repeat(level)} ${text}`, '')
      } else if (type === 'checkListItem') out.push(`${pad}- [${b.props?.checked ? 'x' : ' '}] ${text}`)
      else if (type === 'bulletListItem') out.push(`${pad}- ${text}`)
      else if (type === 'numberedListItem') out.push(`${pad}${n}. ${text}`)
      else if (type === 'quote') out.push(`${pad}> ${text}`)
      else if (type === 'image') {
        const url = typeof b.props?.url === 'string' ? b.props.url : ''
        if (url && !url.startsWith('data:')) out.push('', `![photo](${url})`, '')
      } else if (text) out.push(`${pad}${text}`, '')
      walk(b.children, depth + 1)
    }
  }
  walk(fileBlocks, 0)
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

export interface RecipeFileInput {
  id: string
  title: string
  icon: string | null
  cover: string | null
  values: Record<string, unknown>
}

/** Le contenu de recette.json. */
export function recipeJsonText(recipe: RecipeFileInput, fileBlocks: unknown[]): string {
  return JSON.stringify({ format: FILE_FORMAT, version: 1, id: recipe.id, title: recipe.title, icon: recipe.icon, cover: recipe.cover, properties: recipe.values, content: fileBlocks }, null, 2)
}

export interface ParsedRecipe {
  id: string
  title: string
  icon: string | null
  cover: string | null
  values: Record<string, unknown>
  content: unknown[]
}

/** Lit un recette.json ; une erreur en français simple si le fichier n'est pas lisible ou n'est pas une recette de Form. */
export function parseRecipeJson(text: string): ParsedRecipe | { error: string } {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(text)
  } catch {
    return { error: "Ce fichier n'est pas lisible." }
  }
  if (!data || typeof data !== 'object' || data.format !== FILE_FORMAT) return { error: "Ce fichier n'est pas une recette de Form." }
  const title = typeof data.title === 'string' ? data.title.trim() : ''
  if (!title) return { error: 'Cette recette n’a pas de titre.' }
  const values = data.properties && typeof data.properties === 'object' && !Array.isArray(data.properties) ? (data.properties as Record<string, unknown>) : {}
  return {
    id: typeof data.id === 'string' ? data.id : '',
    title,
    icon: typeof data.icon === 'string' ? data.icon : null,
    cover: typeof data.cover === 'string' ? data.cover : null,
    values,
    content: Array.isArray(data.content) ? data.content : [],
  }
}

/** Remet l'adresse « form-lib:… » sur les photos d'un recette.json (qui ne contient que des noms de fichier comme « photo-1.jpg »). */
export function restoreBlocks(content: unknown[], dir: string): unknown[] {
  const copy = structuredClone(content)
  eachBlock(copy, (b) => {
    const url = b.props?.url
    if (b.type === 'image' && typeof url === 'string' && /^photo-\d+\.[a-z0-9]+$/i.test(url)) {
      b.props = { ...b.props, url: toLibraryUrl(`${RECIPE_FOLDER}/${dir}/${url}`) }
    }
  })
  return copy
}

/** Du texte en base64 (UTF-8), pour l'écrire dans un fichier. */
export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
