import { invoke } from '@tauri-apps/api/core'
import { getDb } from '@/biblio/lib/db.ts'
import { parseContent } from '@/lib/content'
import { joinPath, todayISO } from '@/lib/backup'
import { parseSchema } from '@/lib/database'
import { countDataImages, moveImagesToLibrary } from '@/lib/libraryImages'
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

/** Combien de photos de recettes sont encore dans la base, et ce qu'elles pèsent. */
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

export interface MoveRecipePhotosResult {
  recipes: number
  moved: number
  failed: number
  bytes: number
  /** Chemin de la copie de sécurité de la base, faite juste avant. */
  backup: string
}

/**
 * Range les photos des recettes dans le dossier « recette » de la bibliothèque. Avant de toucher à la base, une copie de sécurité
 * est faite. Une recette n'est réécrite que si TOUTES ses photos ont été rangées ; sinon elle reste telle quelle (rien n'est perdu).
 */
export async function moveRecipePhotos(rows: ObjectRow[], root: string, onProgress: (done: number, total: number) => void): Promise<MoveRecipePhotosResult> {
  const { repo, update } = useApp.getState()
  if (!repo) throw new Error('La base de données n’est pas prête.')
  let dir = await repo.getSetting('backup_dir')
  if (!dir) dir = await invoke<string>('default_backup_dir')
  const backup = joinPath(dir, `form-avant-photos-recettes-${todayISO()}.db`)
  await repo.backupTo(backup)

  const todo = rows.filter((r) => countDataImages(parseContent(r.content)).count > 0)
  let moved = 0
  let failed = 0
  let bytes = 0
  let recipes = 0
  let done = 0
  for (const row of todo) {
    onProgress(done, todo.length)
    const blocks = parseContent(row.content) ?? []
    const r = await moveImagesToLibrary(blocks, async (image) => invoke<string>('library_store_image', { root, data: image.base64, ext: image.ext }))
    if (r.failed === 0 && r.moved > 0) {
      await update(row.id, { content: JSON.stringify(r.blocks) })
      recipes++
      moved += r.moved
      bytes += r.bytes
    } else {
      failed += r.failed
    }
    done++
  }
  onProgress(done, todo.length)
  // Les pages réécrites laissent de la place libre dans le fichier de la base : on la rend.
  if (recipes > 0) await getDb().then((db) => db.execute('VACUUM')).catch(() => undefined)
  return { recipes, moved, failed, bytes, backup }
}
