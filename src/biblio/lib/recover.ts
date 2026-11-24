// Fichiers introuvables : les retélécharger depuis Instagram ou Pinterest et les remettre à leur place.
// Chaque fichier garde le nom qu'il avait (Instagram : date_code-du-post_numéro ; Pinterest : numéro de l'épingle), ce qui permet
// de retrouver le post ou l'épingle d'origine. Le téléchargement est fait par gallery-dl (commande `link_fetch`, dossier temporaire),
// puis chaque fichier est remis à son chemin (`recover_place`) ; la mise à jour de la bibliothèque le marque ensuite « retrouvé ».
// Les images ajoutées à la main n'ont pas de source : elles ne peuvent pas être retéléchargées.

import { invoke } from '@tauri-apps/api/core'
import { getDb } from './db.ts'
import { loadSaverSettings } from './saver.ts'

export interface MissingFile { rel: string; blockId: string; source: string; originUrl: string | null }

const base = (rel: string) => rel.split(/[\\/]/).pop() ?? rel

/** Instagram : « 20260411_DW_gXlYDA6J_04.jpg » → { code: 'DW_gXlYDA6J', num: '04' } (le code peut contenir des « _ »). */
export function instagramParts(rel: string): { code: string; num: string } | null {
  const m = /^\d{8}_(.+)_(\d{2})\.[a-z0-9]+$/i.exec(base(rel))
  return m ? { code: m[1], num: m[2] } : null
}

/** Pinterest : « 100697741658949760.jpg » → '100697741658949760'. */
export function pinterestId(rel: string): string | null {
  return /^(\d{6,})\.[a-z0-9]+$/i.exec(base(rel))?.[1] ?? null
}

/**
 * Les sources qu'on sait retélécharger aujourd'hui. Pinterest : gallery-dl répond « épingle introuvable » pour toute épingle demandée seule
 * (même une épingle qui existe encore, essayé le 24/11/2026) ; on ne la tente donc pas, pour ne pas faire attendre pour rien.
 */
export const RECOVERABLE = new Set(['instagram'])

/** L'adresse du post ou de l'épingle d'où vient ce fichier (null : rien à retélécharger). */
export function recoverUrl(f: MissingFile): string | null {
  if (f.source === 'instagram') {
    const p = instagramParts(f.rel)
    return p ? `https://www.instagram.com/p/${p.code}/` : null
  }
  if (f.source === 'pinterest') {
    if (f.originUrl && /pinterest\.[a-z.]+\/pin\/\d+/i.test(f.originUrl)) return f.originUrl
    const id = pinterestId(f.rel)
    return id ? `https://www.pinterest.com/pin/${id}/` : null
  }
  return null
}

/**
 * Le fichier téléchargé qui correspond à ce fichier manquant. Le téléchargement temporaire nomme les fichiers
 * « code_04.jpg » (Instagram) ou « 1006977….jpg » (Pinterest) ; l'extension peut changer (jpg ↔ webp…).
 */
export function matchDownloaded(f: MissingFile, files: string[]): string | null {
  const stem = (p: string) => base(p).replace(/\.[a-z0-9]+$/i, '')
  if (f.source === 'instagram') {
    // Dans un carrousel, chaque image a son propre code : téléchargée seule, elle est numérotée « 01 ».
    const p = instagramParts(f.rel)
    if (!p) return null
    return files.find((x) => stem(x) === `${p.code}_${p.num}`) ?? files.find((x) => stem(x).startsWith(`${p.code}_`)) ?? null
  }
  const want = f.source === 'pinterest' ? pinterestId(f.rel) : null
  if (!want) return null
  return files.find((x) => stem(x) === want) ?? null
}

/** Regroupe les fichiers manquants par adresse à télécharger (un carrousel Instagram = un seul téléchargement). */
export function groupByUrl(files: MissingFile[]): { url: string; source: string; files: MissingFile[] }[] {
  const groups = new Map<string, { url: string; source: string; files: MissingFile[] }>()
  for (const f of files) {
    const url = recoverUrl(f)
    if (!url) continue
    const g = groups.get(url) ?? { url, source: f.source, files: [] }
    g.files.push(f)
    groups.set(url, g)
  }
  return [...groups.values()]
}

/** Un refus du site (connexion expirée, trop de demandes) : on s'arrête au lieu d'insister. */
export const isBlocked = (message: string) => /401|403|429|login|log in|connexion|cookies|rate.?limit|too many/i.test(message)

export async function listMissing(blockIds?: string[]): Promise<MissingFile[]> {
  const d = await getDb()
  const where = blockIds && blockIds.length > 0 ? ` AND b.id IN (${blockIds.map((_, i) => `$${i + 1}`).join(', ')})` : ''
  const rows = await d.select<{ rel: string; blockId: string; source: string; originUrl: string | null }[]>(
    `SELECT f.path_rel AS rel, b.id AS blockId, b.source AS source, b.origin_url AS originUrl
       FROM lib_files f JOIN lib_blocks b ON b.id = f.block_id
      WHERE f.missing = 1 AND b.trashed_at IS NULL${where}
      ORDER BY b.source, f.path_rel`,
    blockIds ?? [],
  )
  return rows
}

export interface RecoverProgress { done: number; total: number; restored: number; failed: number; label: string }
export interface RecoverResult { restored: number; failed: number; noSource: number; stoppedBecause: string | null }

/**
 * Retélécharge les fichiers manquants (tous, ou ceux de quelques images) des sources de RECOVERABLE, un post ou une épingle à la fois, avec les pauses de gallery-dl.
 * `shouldStop` est consulté entre deux téléchargements.
 */
export async function recoverMissing(root: string, opts: { blockIds?: string[]; onProgress?: (p: RecoverProgress) => void; shouldStop?: () => boolean } = {}): Promise<RecoverResult> {
  const missing = await listMissing(opts.blockIds)
  const groups = groupByUrl(missing.filter((f) => RECOVERABLE.has(f.source)))
  const noSource = missing.length - groups.reduce((n, g) => n + g.files.length, 0)
  const { settings } = await loadSaverSettings()
  let restored = 0
  let failed = 0
  let stoppedBecause: string | null = null
  for (const [i, g] of groups.entries()) {
    if (opts.shouldStop?.()) { stoppedBecause = 'Arrêté.'; break }
    opts.onProgress?.({ done: i, total: groups.length, restored, failed, label: g.source === 'instagram' ? 'Instagram' : 'Pinterest' })
    const cookies = g.source === 'instagram' ? settings.igCookies : settings.pinCookies
    try {
      const { dir, files } = await invoke<{ dir: string; files: string[] }>('link_fetch', { url: g.url, cookies: cookies || null, limit: 30 })
      for (const f of g.files) {
        const src = matchDownloaded(f, files)
        if (!src) { failed++; continue }
        try { await invoke('recover_place', { src, root, rel: f.rel }); restored++ } catch { failed++ }
      }
      await invoke('link_cleanup', { dir }).catch(() => undefined)
    } catch (e) {
      failed += g.files.length
      const message = String(e)
      if (isBlocked(message)) { stoppedBecause = `${g.source === 'instagram' ? 'Instagram' : 'Pinterest'} refuse pour le moment (connexion à refaire dans Réglages › Bibliothèque › Téléchargement, ou trop de demandes : réessaie plus tard).`; break }
    }
  }
  opts.onProgress?.({ done: groups.length, total: groups.length, restored, failed, label: '' })
  return { restored, failed, noSource, stoppedBecause }
}
