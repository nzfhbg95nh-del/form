import { isTauri } from '../repo'

/** Enregistre un PDF : boîte « Enregistrer sous » dans l'app Windows, téléchargement dans le navigateur. */
export async function savePdf(blob: Blob, fileName: string): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({ title: 'Enregistrer le PDF', defaultPath: fileName, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
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
