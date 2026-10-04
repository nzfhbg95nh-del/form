import { BlockNoteEditor } from '@blocknote/core'
import { unzipSync } from 'fflate'
import { processImage } from './images'
import {
  buildPlan, convertNotionHtml, imageRefs, indexFiles, resolveAsset, stripPageHeader, type NotionFile, type Plan, type PlanNode,
} from './notion'
import type { ObjectRow, Repo } from './types'

/** Ouvre le ZIP d'export (et les ZIP qu'il contient : Notion en emboîte parfois). */
export function readZip(bytes: Uint8Array, depth = 0): NotionFile[] {
  const entries = unzipSync(bytes)
  const files: NotionFile[] = []
  for (const [path, data] of Object.entries(entries)) {
    if (path.endsWith('/')) continue
    if (depth < 3 && path.toLowerCase().endsWith('.zip')) files.push(...readZip(data, depth + 1))
    else files.push({ path, data })
  }
  return files
}

export function analyze(files: NotionFile[]): Plan {
  return buildPlan(files)
}

export interface ImportOptions {
  withImages: boolean
  rootTitle: string
}

export interface ImportResult {
  created: number
  skipped: number
  images: number
  errors: string[]
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif' }
const MAX_IMAGE_BYTES = 25 * 1024 * 1024

async function toDataUrl(path: string, data: Uint8Array): Promise<string> {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const blob = new Blob([data as BlobPart], { type: MIME[ext] ?? 'application/octet-stream' })
  try {
    return (await processImage(blob)).dataUrl
  } catch {
    // Format que le navigateur ne sait pas réduire (SVG…) : on garde l'image telle quelle.
    return await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(r.error)
      r.readAsDataURL(blob)
    })
  }
}

type Block = { type: string; props?: Record<string, unknown>; children?: Block[]; content?: unknown }

function mapImages(blocks: Block[], resolve: (url: string) => string | null): Block[] {
  return blocks.map((b) => {
    const children = b.children ? mapImages(b.children, resolve) : b.children
    if (b.type === 'image') {
      const url = String(b.props?.url ?? '')
      const mapped = resolve(url)
      if (!mapped) return { type: 'paragraph', content: `[image non importée : ${String(b.props?.name || url)}]` }
      return { ...b, props: { ...b.props, url: mapped }, children }
    }
    return { ...b, children }
  })
}

/** Crée dans Form les pages, bases et lignes du plan. Rien n'est supprimé ni modifié : on ne fait qu'ajouter. */
export async function runImport(
  files: NotionFile[], plan: Plan, repo: Repo, existing: ObjectRow[], opts: ImportOptions,
  onProgress: (done: number, total: number, label: string) => void,
): Promise<ImportResult> {
  const index = indexFiles(files)
  const result: ImportResult = { created: 0, skipped: 0, images: 0, errors: [] }
  const editor = BlockNoteEditor.create()
  const imageCache = new Map<string, string | null>()

  // Ce qui a déjà été importé (même identifiant Notion) n'est pas recréé.
  const known = new Map<string, string>()
  for (const o of existing) {
    try {
      const data = JSON.parse(o.properties)
      if (typeof data?.notion_id === 'string') known.set(data.notion_id, o.id)
    } catch { /* propriétés illisibles : ignorées */ }
  }

  // Rien de nouveau : on ne crée même pas la page « Import Notion ».
  if (plan.nodes.every((n) => known.has(n.key))) return { ...result, skipped: plan.nodes.length }

  const now = new Date().toISOString()
  let order = Date.now()
  const root: ObjectRow = {
    id: crypto.randomUUID(), type: 'page', parent_id: null, title: opts.rootTitle, icon: '📥', cover: null, properties: '{}',
    content: null, position: order++, is_favorite: 0, created_at: now, updated_at: now, deleted_at: null,
  }
  await repo.insertObject(root)
  result.created++

  const created = new Map<string, string>() // clé Notion -> identifiant Form
  const byKey = new Map(plan.nodes.map((n) => [n.key, n]))
  let done = 0

  const contentOf = async (node: PlanNode): Promise<string | null> => {
    if (!node.mdPath) return null
    const raw = index.get(node.mdPath)
    if (!raw) return null
    const text = new TextDecoder('utf-8').decode(raw)
    let md = convertNotionHtml(stripPageHeader(text, node.kind === 'row'))
    if (md.trim() === '') return null
    const refs = [...new Set(imageRefs(md))]
    const urlMap = new Map<string, string | null>()
    for (const [i, ref] of refs.entries()) {
      const placeholder = `notion-image-${i}`
      md = md.split(`(${ref}`).join(`(${placeholder}`)
      const path = resolveAsset(node.mdPath, ref)
      if (!opts.withImages) { urlMap.set(placeholder, null); continue }
      if (!imageCache.has(path)) {
        const data = index.get(path)
        if (!data || data.length > MAX_IMAGE_BYTES) imageCache.set(path, null)
        else {
          try { imageCache.set(path, await toDataUrl(path, data)); result.images++ } catch { imageCache.set(path, null) }
        }
      }
      urlMap.set(placeholder, imageCache.get(path) ?? null)
    }
    let blocks = (await editor.tryParseMarkdownToBlocks(md)) as unknown as Block[]
    blocks = mapImages(blocks, (url) => urlMap.get(url) ?? null)
    return JSON.stringify(blocks)
  }

  const build = async (node: PlanNode): Promise<string | null> => {
    if (created.has(node.key)) return created.get(node.key)!
    const already = known.get(node.key)
    if (already) {
      created.set(node.key, already)
      result.skipped++
      return already
    }
    // Les parents d'abord.
    let parentId = root.id
    if (node.parentKey && byKey.has(node.parentKey)) parentId = (await build(byKey.get(node.parentKey)!)) ?? root.id
    onProgress(done, plan.nodes.length, node.title)
    let content: string | null = null
    try {
      content = await contentOf(node)
    } catch (e) {
      result.errors.push(`« ${node.title} » : contenu non converti (${e instanceof Error ? e.message : String(e)})`)
    }
    const properties =
      node.kind === 'database' ? JSON.stringify({ ...node.schema, notion_id: node.key })
        : node.kind === 'row' ? JSON.stringify({ ...node.values, notion_id: node.key })
          : JSON.stringify({ notion_id: node.key })
    const row: ObjectRow = {
      id: crypto.randomUUID(), type: node.kind === 'row' ? 'row' : node.kind, parent_id: parentId, title: node.title, icon: null, cover: null,
      properties, content, position: order++, is_favorite: 0, created_at: now, updated_at: now, deleted_at: null,
    }
    try {
      await repo.insertObject(row)
      result.created++
      created.set(node.key, row.id)
    } catch (e) {
      result.errors.push(`« ${node.title} » : non importé (${e instanceof Error ? e.message : String(e)})`)
      return null
    }
    done++
    onProgress(done, plan.nodes.length, node.title)
    return row.id
  }

  // Pages et bases d'abord, puis les lignes.
  const sorted = [...plan.nodes].sort((a, b) => (a.kind === 'row' ? 1 : 0) - (b.kind === 'row' ? 1 : 0))
  for (const node of sorted) await build(node)
  return result
}
