import { invoke } from '@tauri-apps/api/core'
import { getDb } from '@/biblio/lib/db.ts'
import { applyThumbBatch, type ThumbResult } from '@/biblio/lib/library.ts'
import { fileUrl, originalPath } from '@/biblio/lib/media.ts'
import { base64Of, fitThumb, frameTime, thumbName } from '@/biblio/lib/videoThumbsPure.ts'

/**
 * Miniatures des vidéos, faites par la fenêtre de l'appli : on lit la première image de la vidéo, on la réduit, et Windows la range dans
 * le dossier des miniatures. Aucun programme en plus (pas de ffmpeg). Seules les vidéos sans miniature sont traitées.
 */

/** Les vidéos de la bibliothèque qui n'ont pas de miniature. */
export async function videosWithoutThumb(): Promise<string[]> {
  const d = await getDb()
  const rows = await d.select<{ rel: string }[]>(
    `SELECT f.path_rel AS rel FROM lib_files f JOIN lib_blocks b ON b.id = f.block_id
     WHERE f.kind = 'video' AND f.thumb_ok <> 1 AND f.missing = 0
     ORDER BY (b.published_at IS NULL), b.published_at DESC, f.path_rel`,
  )
  return rows.map((r) => r.rel)
}

interface Frame {
  base64: string
  w: number
  h: number
  duration: number | null
}

const waitFor = (target: HTMLVideoElement, ok: 'loadeddata' | 'seeked', ms: number) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('délai dépassé')), ms)
    target.addEventListener(ok, () => { window.clearTimeout(timer); resolve() }, { once: true })
    target.addEventListener('error', () => { window.clearTimeout(timer); reject(new Error('vidéo illisible')) }, { once: true })
  })

/** La première image d'une vidéo (réduite, en JPEG), ou une erreur si la fenêtre ne sait pas la lire. */
export async function captureFrame(src: string): Promise<Frame> {
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'auto'
  video.crossOrigin = 'anonymous'
  video.playsInline = true
  try {
    const loaded = waitFor(video, 'loadeddata', 10_000)
    video.src = src
    await loaded
    if (!video.videoWidth || !video.videoHeight) throw new Error('vidéo sans image')
    const at = frameTime(video.duration)
    if (at > 0) {
      const seeked = waitFor(video, 'seeked', 10_000)
      video.currentTime = at
      await seeked
    }
    const size = fitThumb(video.videoWidth, video.videoHeight)
    const canvas = document.createElement('canvas')
    canvas.width = size.w
    canvas.height = size.h
    canvas.getContext('2d')?.drawImage(video, 0, 0, size.w, size.h)
    const base64 = base64Of(canvas.toDataURL('image/jpeg', 0.82))
    if (!base64) throw new Error('image vide')
    return { base64, w: size.w, h: size.h, duration: Number.isFinite(video.duration) ? Math.round(video.duration * 10) / 10 : null }
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

export interface VideoThumbsResult {
  total: number
  made: number
  failed: number
}

/**
 * Fait les miniatures des vidéos qui n'en ont pas, trois à la fois. Les résultats sont enregistrés par lots de 25 ; une vidéo que la fenêtre
 * ne sait pas lire reste « sans miniature » (rien n'est perdu). `shouldStop` permet d'arrêter proprement entre deux vidéos.
 */
export async function makeVideoThumbs(
  root: string,
  onProgress: (done: number, total: number) => void,
  shouldStop: () => boolean = () => false,
): Promise<VideoThumbsResult> {
  const rels = await videosWithoutThumb()
  const result: VideoThumbsResult = { total: rels.length, made: 0, failed: 0 }
  let done = 0
  let next = 0
  let pending: ThumbResult[] = []
  onProgress(0, rels.length)

  const flush = async () => {
    const batch = pending
    pending = []
    if (batch.length > 0) await applyThumbBatch(batch)
  }

  const worker = async () => {
    while (next < rels.length && !shouldStop()) {
      const rel = rels[next++]
      let outcome: ThumbResult
      try {
        const frame = await captureFrame(fileUrl(originalPath(root, rel)))
        const thumb = thumbName(rel)
        await invoke<boolean>('library_write_thumb', { rel: thumb, data: frame.base64 })
        outcome = { rel, thumb, w: frame.w, h: frame.h, duration: frame.duration, ok: true }
        result.made++
      } catch {
        outcome = { rel, thumb: '', w: 0, h: 0, duration: null, ok: false }
        result.failed++
      }
      pending.push(outcome)
      done++
      if (pending.length >= 25) await flush()
      onProgress(done, rels.length)
    }
  }

  await Promise.all([worker(), worker(), worker()])
  await flush()
  return result
}
