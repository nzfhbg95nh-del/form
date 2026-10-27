// Blocs de page « Aperçu de lien » (signet) et « Intégrer » (YouTube, Spotify, Figma…), et le petit menu qui s'ouvre quand on colle un lien.

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ExternalLink, Globe, Link as LinkIcon, X } from 'lucide-react'
import { embedFor, isUrl } from '@/lib/embeds'

export interface LinkPreview { url: string; title: string; description: string; site: string; image: string | null }

/** Lit une page web (titre, description, site, petite image) par le programme de l'appli. */
export const fetchPreview = (url: string) => invoke<LinkPreview>('link_preview', { url })

/** Une ligne où l'on colle une adresse (bloc fraîchement ajouté avec « / »). */
function UrlPrompt({ placeholder, hint, onSubmit }: { placeholder: string; hint: string; onSubmit: (url: string) => void }) {
  const [value, setValue] = useState('')
  const ok = isUrl(value)
  return (
    <div contentEditable={false} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-3 py-2">
      <LinkIcon size={16} className="shrink-0 text-[var(--fg-muted)]" />
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && ok) onSubmit(value.trim()) }}
        onPaste={(e) => { const t = e.clipboardData.getData('text/plain').trim(); if (isUrl(t)) { e.preventDefault(); onSubmit(t) } }}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--fg-muted)]"
        aria-label={hint}
      />
      <button type="button" className="btn !px-2.5 !py-1 !text-xs" disabled={!ok} onClick={() => onSubmit(value.trim())}>Valider</button>
    </div>
  )
}

export interface BookmarkProps { url: string; title: string; description: string; site: string; image: string }

/** Le bloc « Aperçu de lien » : une carte avec le titre, la description, le site et une image. */
export function BookmarkBlock({ props, update }: { props: BookmarkProps; update: (p: Partial<BookmarkProps>) => void }) {
  const [failed, setFailed] = useState<string | null>(null)
  const { url, title } = props

  // Une adresse sans aperçu encore : on lit la page, puis on garde le résultat dans le bloc (il n'est plus relu).
  useEffect(() => {
    if (!url || title) return
    let cancelled = false
    void fetchPreview(url)
      .then((p) => { if (!cancelled) update({ url: p.url, title: p.title || p.site || url, description: p.description, site: p.site, image: p.image ?? '' }) })
      .catch((e) => { if (!cancelled) setFailed(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [url, title]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!url) return <UrlPrompt placeholder="Colle un lien web pour en faire un aperçu…" hint="Adresse du lien" onSubmit={(u) => update({ url: u })} />
  if (!title) {
    return (
      <div contentEditable={false} className="flex w-full items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-3 text-sm text-[var(--fg-muted)]">
        <Globe size={16} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{failed ? `${url} · ${failed}` : `Lecture de ${url}…`}</span>
        {failed && <button type="button" className="btn !px-2.5 !py-1 !text-xs" onClick={() => update({ title: url })}>Garder le lien</button>}
      </div>
    )
  }
  return (
    <button
      type="button"
      contentEditable={false}
      onClick={() => void openUrl(url)}
      className="group flex w-full items-stretch overflow-hidden rounded-xl border border-[var(--border)] text-left transition-colors hover:bg-[var(--bg-hover)]"
      title={url}
    >
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-4 py-3">
        <div className="truncate text-sm font-medium">{title}</div>
        {props.description && <div className="line-clamp-2 text-xs text-[var(--fg-muted)]">{props.description}</div>}
        <div className="flex items-center gap-1.5 truncate text-xs text-[var(--fg-muted)]"><Globe size={12} className="shrink-0" />{props.site || new URL(url).hostname.replace(/^www\./, '')}</div>
      </div>
      {props.image && <img src={props.image} alt="" draggable={false} className="h-auto w-40 shrink-0 object-cover" />}
    </button>
  )
}

export interface EmbedProps { url: string; src: string; provider: string; height: number }

/** Le bloc « Intégrer » : la vidéo, la musique, le plan… s'affiche directement dans la page. */
export function EmbedBlock({ props, update }: { props: EmbedProps; update: (p: Partial<EmbedProps>) => void }) {
  const [error, setError] = useState<string | null>(null)
  if (!props.src) {
    return (
      <>
        <UrlPrompt
          placeholder="Colle un lien YouTube, Vimeo, Spotify, Figma, Loom ou Google Maps…"
          hint="Adresse à intégrer"
          onSubmit={(u) => {
            const info = embedFor(u)
            if (!info) { setError('Ce site ne peut pas être intégré. Utilise « Aperçu de lien web ».'); return }
            setError(null)
            update({ url: u, src: info.src, provider: info.provider, height: info.height })
          }}
        />
        {error && <div contentEditable={false} className="mt-1 px-1 text-xs text-red-500">{error}</div>}
      </>
    )
  }
  return (
    <div contentEditable={false} className="group relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-side)]">
      <iframe
        src={props.src}
        title={props.url}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="block w-full"
        style={{ height: props.height, border: 0 }}
      />
      <button
        type="button"
        onClick={() => void openUrl(props.url)}
        title="Ouvrir dans le navigateur"
        aria-label="Ouvrir dans le navigateur"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--bg)]/90 text-[var(--fg-muted)] opacity-0 shadow-sm transition-opacity hover:text-[var(--fg)] group-hover:opacity-100"
      >
        <ExternalLink size={14} />
      </button>
    </div>
  )
}

/** Le petit menu qui s'ouvre après avoir collé un lien seul sur une ligne vide : garder le lien, en faire un aperçu, ou l'intégrer. */
export function PasteLinkMenu({ url, x, y, onKeep, onPreview, onEmbed, onClose }: {
  url: string; x: number; y: number; onKeep: () => void; onPreview: () => void; onEmbed: () => void; onClose: () => void
}) {
  const info = embedFor(url)
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])
  const item = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)]'
  return (
    <>
      <div className="fixed inset-0 z-[80]" onPointerDown={onClose} />
      <div role="menu" className="fixed z-[90] w-64 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1.5 shadow-[var(--shadow-lift)]" style={{ left: Math.max(8, Math.min(x, window.innerWidth - 280)), top: Math.min(y + 6, window.innerHeight - 160) }}>
        <div className="flex items-center justify-between px-2.5 pb-1 pt-0.5"><span className="lib-count">Lien collé</span><button className="rounded p-0.5 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]" onClick={onClose} aria-label="Fermer"><X size={12} /></button></div>
        <button role="menuitem" className={item} onClick={onKeep}><LinkIcon size={15} /> Garder le lien</button>
        <button role="menuitem" className={item} onClick={onPreview}><Globe size={15} /> Aperçu du lien</button>
        {info && <button role="menuitem" className={item} onClick={onEmbed}><ExternalLink size={15} /> Intégrer ({info.label})</button>}
      </div>
    </>
  )
}
