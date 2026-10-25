// Ajouter les images de la bibliothèque aux moodboards de Form. Un moodboard de Form garde une copie de chaque image dans sa base
// (réduite à 2 400 px, avec une miniature) : on réutilise la même préparation que pour un glisser-déposer.

import { useMemo } from 'react'
import { loadBlockFiles, type GridBlock } from '@/biblio/lib/blocks.ts'
import { getDb } from '@/biblio/lib/db.ts'
import { fileUrl, originalPath, thumbPath } from '@/biblio/lib/media.ts'
import { useBoardReload } from '@/biblio/store/boardReload.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import { processImage } from '@/lib/images'
import { addedMessage, assetName, assetPrefix, placeNewItems, slidesOf } from '@/biblio/lib/formBoardsPure.ts'
import { makeImage, parseBoard, serializeBoard, type BoardItem } from '@/lib/moodboard'
import { useApp } from '@/store/app'

/** Les moodboards de Form (ceux qui ne sont pas à la corbeille). */
export function useFormBoards() {
  const objects = useApp((s) => s.objects)
  return useMemo(() => objects.filter((o) => o.type === 'moodboard' && !o.deleted_at).map((o) => ({ id: o.id, name: o.title || 'Moodboard' })), [objects])
}

/** Crée un moodboard (sans l'ouvrir) et rend son identifiant. */
export async function createBoard(name: string): Promise<string> {
  const repo = useApp.getState().repo
  if (!repo) throw new Error('Form n\'est pas prêt.')
  const board = await repo.createPage(null, 'moodboard')
  const patch = { title: name.trim() || 'Moodboard', icon: '🖼️' }
  await repo.updateObject(board.id, patch)
  useApp.setState((s) => ({ objects: [...s.objects, { ...board, ...patch }] }))
  return board.id
}

/** Les moodboards qui contiennent déjà une image de ce bloc. */
export async function boardsContaining(blockId: string): Promise<string[]> {
  const db = await getDb()
  const prefix = assetPrefix(blockId)
  const rows = await db.select<{ board_id: string }[]>('SELECT DISTINCT board_id FROM board_assets WHERE substr(name, 1, length($1)) = $1', [prefix])
  return rows.map((r) => r.board_id)
}

async function toBlob(url: string): Promise<Blob | null> {
  try {
    const r = await fetch(url)
    return r.ok ? await r.blob() : null
  } catch {
    return null
  }
}

/** Ajoute les images des blocs au moodboard. Rend le nombre d'images ajoutées et le nombre de fichiers illisibles. */
export async function addBlocksToBoard(boardId: string, blocks: readonly GridBlock[]): Promise<{ added: number; failed: number }> {
  const app = useApp.getState()
  const repo = app.repo
  const board = app.objects.find((o) => o.id === boardId && o.type === 'moodboard' && !o.deleted_at)
  if (!repo || !board) throw new Error("Ce moodboard n'existe plus.")
  const root = useLibrary.getState().root
  const thumbsDir = useGrid.getState().thumbsDir
  const created: BoardItem[] = []
  let failed = 0
  for (const block of blocks) {
    for (const f of slidesOf(await loadBlockFiles(block.id))) {
      let prepared = null
      // L'original d'abord (sauf pour une vidéo : on prend son image d'aperçu) ; sinon la miniature (HEIC, fichier absent…).
      const original = f.kind === 'image' && !f.missing ? await toBlob(fileUrl(originalPath(root, f.rel))) : null
      if (original) prepared = await processImage(original).catch(() => null)
      if (!prepared && f.thumb && thumbsDir) {
        const thumb = await toBlob(fileUrl(thumbPath(thumbsDir, f.thumb)))
        if (thumb) prepared = await processImage(thumb).catch(() => null)
      }
      if (!prepared) {
        failed++
        continue
      }
      const item = makeImage(crypto.randomUUID(), prepared.width, prepared.height, { x: 0, y: 0 })
      await repo.saveBoardAsset({
        board_id: boardId, id: item.assetId!, name: assetName(block.id, f.rel.split(/[\\/]/).pop() ?? 'image'),
        width: prepared.width, height: prepared.height, data_url: prepared.dataUrl, thumb_url: prepared.thumbUrl, created_at: new Date().toISOString(),
      })
      created.push(item)
    }
  }
  if (created.length > 0) {
    const current = parseBoard(useApp.getState().objects.find((o) => o.id === boardId)?.content ?? board.content)
    const content = serializeBoard({ ...current, items: placeNewItems(current.items, created) })
    await repo.updateObject(boardId, { content })
    useApp.setState((s) => ({ objects: s.objects.map((o) => (o.id === boardId ? { ...o, content } : o)) }))
    // Si ce moodboard est ouvert, sa toile est rechargée pour montrer les nouvelles images.
    useBoardReload.getState().bump(boardId)
  }
  return { added: created.length, failed }
}

export { addedMessage }
