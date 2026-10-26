// Ajouter des images à la main dans la bibliothèque. Les fichiers sont copiés dans « Mes ajouts » (Documents\Form\Mes ajouts) par Rust, sans doublon ;
// ensuite la bibliothèque se met à jour, et le reste suit tout seul : miniatures, puis couleurs, empreintes de l'IA et types d'image (donc la recherche).

import { invoke } from '@tauri-apps/api/core'
import { useLibrary } from '@/biblio/store/library.ts'
import { useToast } from '@/biblio/store/toast.ts'
import { ALLOWED_EXT, summarize, type AddOutcome } from './ajoutsPure.ts'

export { ALLOWED_EXT, summarize }
export type { AddOutcome }

/** Une fois les fichiers copiés : on met la bibliothèque à jour (elle attend si un calcul est en cours). */
async function refreshLibrary() {
  const lib = useLibrary.getState()
  for (let i = 0; i < 120 && useLibrary.getState().phase !== 'idle'; i++) await new Promise((r) => setTimeout(r, 500))
  await lib.update()
}

async function finish(outcomes: AddOutcome[]) {
  const message = summarize(outcomes)
  if (message) useToast.getState().show(message)
  if (outcomes.some((o) => o.status === 'added')) await refreshLibrary()
}

/** Ajoute des fichiers ou des dossiers (chemins complets, choisis dans la fenêtre de Windows). */
export async function addPaths(paths: string[]) {
  if (paths.length === 0) return
  try {
    await finish(await invoke<AddOutcome[]>('add_images', { paths }))
  } catch (e) {
    useToast.getState().show(e instanceof Error ? e.message : String(e))
  }
}

const extOf = (f: File) => {
  const fromName = /\.(\w+)$/.exec(f.name)?.[1]?.toLowerCase()
  if (fromName && (ALLOWED_EXT as readonly string[]).includes(fromName)) return fromName
  const fromType = f.type.split('/')[1]?.toLowerCase().replace('jpeg', 'jpg')
  return fromType && (ALLOWED_EXT as readonly string[]).includes(fromType) ? fromType : (fromName ?? 'png')
}

const toBase64 = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(f)
  })

/** Ajoute des fichiers déposés sur la fenêtre ou collés (on n'en connaît pas le chemin : leur contenu est envoyé). */
export async function addFiles(files: File[]) {
  if (files.length === 0) return
  try {
    const outcomes: AddOutcome[] = []
    for (const f of files) {
      const out = await invoke<AddOutcome>('add_image_bytes', { data: await toBase64(f), ext: extOf(f) })
      outcomes.push({ ...out, name: f.name || out.name })
    }
    await finish(outcomes)
  } catch (e) {
    useToast.getState().show(e instanceof Error ? e.message : String(e))
  }
}
