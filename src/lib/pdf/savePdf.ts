import { isTauri } from '../repo'

/** Enregistre un fichier : boîte « Enregistrer sous » dans l'app Windows, téléchargement dans le navigateur. */
export async function saveBlob(blob: Blob, fileName: string, filter: { name: string; extensions: string[] }): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({ title: 'Enregistrer le fichier', defaultPath: fileName, filters: [filter] })
    if (!path) return null
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()))
    return path
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
  return fileName
}

export const savePdf = (blob: Blob, fileName: string) => saveBlob(blob, fileName, { name: 'PDF', extensions: ['pdf'] })
export const saveCsv = (text: string, fileName: string) => saveBlob(new Blob([text], { type: 'text/csv;charset=utf-8' }), fileName, { name: 'Fichier CSV', extensions: ['csv'] })
