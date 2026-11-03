// Bloc de page « Vidéo » : un fichier de l'ordinateur (lu depuis son emplacement) ou un lien YouTube / Vimeo / Loom.

import { useState } from 'react'
import { Film, FolderOpen, Link as LinkIcon } from 'lucide-react'
import { isTauri } from '@/lib/repo'
import { fileNameOf, isLocalPath, VIDEO_LINK_PROBLEM, videoSource } from '@/lib/video'
import { pickVideoFile, playableUrl } from '@/lib/videoFile'

export interface VideoProps { url: string; name: string }

export function VideoBlock({ props, update }: { props: VideoProps; update: (p: Partial<VideoProps>) => void }) {
  const [link, setLink] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  // « Introuvable » vaut pour l'adresse qui a échoué : en choisir une autre repart à zéro, sans effet à écrire.
  const [missingUrl, setMissingUrl] = useState<string | null>(null)
  const { url } = props
  const missing = missingUrl === url

  const choose = async () => {
    try {
      const path = await pickVideoFile()
      if (path) { setProblem(null); update({ url: path, name: fileNameOf(path) }) }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e))
    }
  }
  const submitLink = () => {
    const src = videoSource(link)
    if (!src || src.kind !== 'embed') { setProblem(VIDEO_LINK_PROBLEM); return }
    setProblem(null)
    update({ url: link.trim(), name: src.info.label })
  }

  if (!url) {
    return (
      <div contentEditable={false} className="flex w-full flex-col gap-2 rounded-xl border border-dashed border-[var(--border)] px-3 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Film size={16} className="shrink-0 text-[var(--fg-muted)]" />
          {isTauri()
            ? <button type="button" className="btn !px-2.5 !py-1 !text-xs" onClick={() => void choose()}><FolderOpen size={13} className="mr-1 inline" />Choisir un fichier vidéo</button>
            : <span className="text-[var(--fg-muted)]">Les fichiers vidéo se choisissent dans l’application Windows.</span>}
          <span className="text-xs text-[var(--fg-muted)]">ou colle un lien</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5">
          <LinkIcon size={14} className="shrink-0 text-[var(--fg-muted)]" />
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') submitLink() }}
            onPaste={(e) => { const t = e.clipboardData.getData('text/plain').trim(); const s = videoSource(t); if (s?.kind === 'embed') { e.preventDefault(); update({ url: t, name: s.info.label }) } }}
            placeholder="Lien YouTube, Vimeo ou Loom…"
            aria-label="Lien de la vidéo"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--fg-muted)]"
          />
          <button type="button" className="btn !px-2.5 !py-1 !text-xs" disabled={!link.trim()} onClick={submitLink}>Valider</button>
        </div>
        {problem && <div className="px-1 text-xs text-red-500">{problem}</div>}
      </div>
    )
  }

  const src = videoSource(url)
  if (src?.kind === 'embed') {
    return (
      <div contentEditable={false} className="w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-side)]">
        <iframe
          src={src.info.src}
          title={src.info.label}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="block w-full"
          style={{ height: src.info.height, border: 0 }}
        />
      </div>
    )
  }

  if (missing) {
    return (
      <div contentEditable={false} className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-3 text-sm text-[var(--fg-muted)]">
        <Film size={16} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">Vidéo introuvable : {props.name || fileNameOf(url)}</span>
        {isTauri() && <button type="button" className="btn !px-2.5 !py-1 !text-xs" onClick={() => void choose()}>Choisir un autre fichier</button>}
      </div>
    )
  }

  // Un chemin de l'ordinateur, ou une vidéo déjà enregistrée dans la page par l'ancien bloc.
  return (
    <div contentEditable={false} className="w-full overflow-hidden rounded-xl bg-black">
      <video
        src={playableUrl(url)}
        controls
        preload="metadata"
        title={props.name || (isLocalPath(url) ? fileNameOf(url) : undefined)}
        onError={() => setMissingUrl(url)}
        className="mx-auto block w-full"
        style={{ maxHeight: '70vh' }}
      />
    </div>
  )
}
