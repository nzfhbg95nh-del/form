// Exporter un moodboard dans un fichier .formboard, ou en importer un (voir boardFile.ts pour le format).

import { useToast } from '@/biblio/store/toast.ts'
import { useApp } from '@/store/app'
import { boardFileName, buildBoardFile, BOARD_FILE_EXTENSION, importedTitle, parseBoardFile } from './boardFile'
import { parseBoard, serializeBoard } from './moodboard'
import { imagesFolderName, planImageExport } from './boardImages'
import { isTauri } from './repo'
import { coverAssetOf, withCoverAsset } from '@/biblio/lib/moodboardList.ts'
import { saveBlob } from './pdf/savePdf'

const say = (message: string) => useToast.getState().show(message)

/** Enregistre le moodboard (avec toutes ses images) dans un fichier choisi par l'utilisateur. content : le plan tel qu'il est à l'écran, quand il n'est pas encore enregistré. */
export async function exportBoard(boardId: string, content?: string): Promise<void> {
  const { repo, objects } = useApp.getState()
  const board = objects.find((o) => o.id === boardId && o.type === 'moodboard')
  if (!repo || !board) return say('Ce moodboard est introuvable.')
  try {
    const assets = await repo.listBoardAssets(boardId)
    const text = buildBoardFile({ title: board.title, icon: board.icon, content: content ?? board.content, coverAsset: coverAssetOf(board.properties), assets })
    const saved = await saveBlob(new Blob([text], { type: 'application/json' }), boardFileName(board.title), { name: 'Moodboard Form', extensions: [BOARD_FILE_EXTENSION] })
    if (saved) say(`« ${board.title.trim() || 'Moodboard'} » exporté.`)
  } catch (e) {
    say(`Export impossible : ${String(e)}`)
  }
}

/**
 * Range toutes les images du moodboard (celles posées sur la toile) dans un dossier : l'utilisateur choisit où, Form y crée « Titre - images »
 * et y met 001.jpg, 002.png… dans l'ordre de lecture de la toile. content : le plan tel qu'il est à l'écran, quand il n'est pas encore enregistré.
 */
export async function exportBoardImages(boardId: string, content?: string): Promise<void> {
  const { repo, objects } = useApp.getState()
  const board = objects.find((o) => o.id === boardId && o.type === 'moodboard')
  if (!repo || !board) return say('Ce moodboard est introuvable.')
  if (!isTauri()) return say('L’export en dossier existe seulement dans l’application Windows.')
  try {
    const assets = await repo.listBoardAssets(boardId)
    const files = planImageExport(parseBoard(content ?? board.content).items, assets)
    if (files.length === 0) return say('Ce moodboard n’a pas encore d’image à exporter.')
    const { open } = await import('@tauri-apps/plugin-dialog')
    const parent = await open({ directory: true, recursive: true, title: 'Où ranger le dossier des images ?' })
    if (typeof parent !== 'string') return
    const { mkdir, writeFile } = await import('@tauri-apps/plugin-fs')
    const folder = `${parent.replace(/[\\/]+$/, '')}\\${imagesFolderName(board.title)}`
    await mkdir(folder, { recursive: true })
    for (const f of files) {
      const bytes = new Uint8Array(await (await fetch(f.dataUrl)).arrayBuffer())
      await writeFile(`${folder}\\${f.name}`, bytes)
    }
    say(`${files.length} image${files.length > 1 ? 's' : ''} exportée${files.length > 1 ? 's' : ''} dans « ${imagesFolderName(board.title)} ».`)
  } catch (e) {
    say(`Export impossible : ${String(e)}`)
  }
}

/** Crée un nouveau moodboard à partir d'un fichier .formboard. Rend son identifiant, ou null si le fichier est refusé (un message explique pourquoi). */
export async function importBoard(file: File): Promise<string | null> {
  const { repo, objects } = useApp.getState()
  if (!repo) {
    say('Form n’est pas prêt.')
    return null
  }
  try {
    const parsed = parseBoardFile(await file.text())
    if (!parsed.ok) {
      say(parsed.error)
      return null
    }
    const { file: data } = parsed
    const title = importedTitle(data.title, objects.filter((o) => o.type === 'moodboard' && !o.deleted_at).map((o) => o.title))
    const created = await repo.createPage(null, 'moodboard')
    const patch = {
      title,
      icon: data.icon ?? '🖼️',
      content: serializeBoard(data.board),
      properties: withCoverAsset(created.properties ?? null, data.coverAsset),
    }
    for (const a of data.assets) await repo.saveBoardAsset({ ...a, board_id: created.id })
    await repo.updateObject(created.id, patch)
    useApp.setState((s) => ({ objects: [...s.objects, { ...created, ...patch }] }))
    say(`« ${title} » importé (${data.assets.length} image${data.assets.length > 1 ? 's' : ''}).`)
    return created.id
  } catch (e) {
    say(`Import impossible : ${String(e)}`)
    return null
  }
}
