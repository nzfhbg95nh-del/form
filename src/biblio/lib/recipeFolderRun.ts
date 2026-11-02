import { invoke } from '@tauri-apps/api/core'
import { getDb } from '@/biblio/lib/db.ts'
import { backupDirs, joinPath, todayISO } from '@/lib/backup'
import { parseContent } from '@/lib/content'
import { parseSchema, parseValues } from '@/lib/database'
import { countDataImages } from '@/lib/libraryImages'
import { parseRecipeJson, planRecipe, recipeJsonText, recipeMarkdown, restoreBlocks, RECIPE_FOLDER, utf8ToBase64 } from '@/lib/recipeFolder'
import type { ObjectRow } from '@/lib/types'
import { useApp } from '@/store/app'

/** Les recettes (lignes de la base « Recettes ») qui ne sont pas à la corbeille. */
export function recipeRows(objects: ObjectRow[]): ObjectRow[] {
  const recipeDbs = new Set(objects.filter((o) => o.type === 'database' && !o.deleted_at && parseSchema(o.properties).kind === 'recipes').map((o) => o.id))
  return objects.filter((o) => o.type === 'row' && !o.deleted_at && o.parent_id !== null && recipeDbs.has(o.parent_id))
}

export interface RecipePhotoScan {
  recipes: number
  photos: number
  bytes: number
}

/** Combien de photos de recettes sont encore dans la base (pas dans le dossier), et ce qu'elles pèsent. */
export function scanRecipePhotos(rows: ObjectRow[]): RecipePhotoScan {
  let recipes = 0
  let photos = 0
  let bytes = 0
  for (const r of rows) {
    const n = countDataImages(parseContent(r.content))
    if (n.count > 0) {
      recipes++
      photos += n.count
      bytes += n.bytes
    }
  }
  return { recipes, photos, bytes }
}

const write = (root: string, rel: string, base64: string) => invoke<boolean>('library_write_file', { root, rel, data: base64 })

export interface ExportResult {
  recipes: number
  /** Photos écrites (les photos déjà dans le dossier ne comptent pas). */
  photos: number
  /** Recettes dont la page, dans la base, pointe maintenant vers le dossier (la base s'allège). */
  lightened: number
  failed: number
  errors: string[]
  /** Copie de sécurité de la base, faite avant de réécrire des pages (rien si aucune photo n'était dans la base). */
  backup: string | null
}

/**
 * Range chaque recette dans son dossier « recette/<titre> [id]/ » : recette.json, recette.md et les photos. Si des photos étaient
 * dans la base, une copie de sécurité est faite d'abord, puis la page pointe vers le dossier (la base s'allège). Une page n'est
 * réécrite que si TOUS ses fichiers ont bien été écrits ; sinon elle reste telle quelle (rien n'est perdu).
 */
export async function exportRecipes(rows: ObjectRow[], root: string, onProgress: (done: number, total: number) => void): Promise<ExportResult> {
  const { repo, update } = useApp.getState()
  if (!repo) throw new Error('La base de données n’est pas prête.')
  const result: ExportResult = { recipes: 0, photos: 0, lightened: 0, failed: 0, errors: [], backup: null }

  if (scanRecipePhotos(rows).photos > 0) {
    const dir = (await backupDirs(repo))[0]
    result.backup = joinPath(dir, `form-avant-recettes-dans-le-dossier-${todayISO()}.db`)
    await repo.backupTo(result.backup)
  }

  let done = 0
  for (const row of rows) {
    onProgress(done, rows.length)
    try {
      const values = parseValues(row.properties)
      const title = row.title ?? ''
      const plan = planRecipe(title, row.id, parseContent(row.content) ?? [])
      const base = `${RECIPE_FOLDER}/${plan.dir}`
      for (const p of plan.photos) {
        if (p.base64 && (await write(root, `${base}/${p.name}`, p.base64))) result.photos++
      }
      await write(root, `${base}/recette.json`, utf8ToBase64(recipeJsonText({ id: row.id, title, icon: row.icon, cover: row.cover, values }, plan.fileBlocks)))
      await write(root, `${base}/recette.md`, utf8ToBase64(recipeMarkdown(title, values, plan.fileBlocks)))
      if (plan.changedDb) {
        await update(row.id, { content: JSON.stringify(plan.dbBlocks) })
        result.lightened++
      }
      result.recipes++
    } catch (e) {
      result.failed++
      if (result.errors.length < 10) result.errors.push(`${row.title || 'Recette sans titre'} : ${String(e)}`)
    }
    done++
  }
  onProgress(done, rows.length)
  // Les pages réécrites laissent de la place libre dans le fichier de la base : on la rend.
  if (result.lightened > 0) await getDb().then((db) => db.execute('VACUUM')).catch(() => undefined)
  return result
}

export interface ImportResult {
  found: number
  created: number
  skipped: number
  errors: string[]
}

/** Reprend les recettes du dossier « recette » (sur un autre ordinateur, par exemple). Une recette dont le titre existe déjà n'est jamais écrasée. */
export async function importRecipes(root: string): Promise<ImportResult> {
  const dirs = await invoke<string[]>('library_list_dir', { root, rel: RECIPE_FOLDER })
  const items: Parameters<ReturnType<typeof useApp.getState>['importRecipeRows']>[0] = []
  const errors: string[] = []
  for (const dir of dirs) {
    try {
      const parsed = parseRecipeJson(await invoke<string>('library_read_text', { root, rel: `${RECIPE_FOLDER}/${dir}/recette.json` }))
      if ('error' in parsed) {
        errors.push(`${dir} : ${parsed.error}`)
        continue
      }
      items.push({ title: parsed.title, icon: parsed.icon, cover: parsed.cover, values: parsed.values, content: restoreBlocks(parsed.content, dir) })
    } catch {
      // Un dossier sans recette.json (autre chose rangé là) est simplement ignoré.
    }
  }
  const { created, skipped } = await useApp.getState().importRecipeRows(items)
  return { found: items.length, created, skipped, errors: errors.slice(0, 10) }
}
