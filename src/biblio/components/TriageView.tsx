import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Check, Play, Sparkles, Trash2, Undo2, X } from 'lucide-react'
import { loadTriage, markTriaged, triagePlan, type TriagePost } from '@/biblio/lib/triage.ts'
import { restoreBlocks, restoreFiles, trashBlocks, trashFiles } from '@/biblio/lib/trash.ts'
import { fileUrl, originalPath, thumbPath } from '@/biblio/lib/media.ts'
import { useCollections } from '@/biblio/store/collections.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import { useToast } from '@/biblio/store/toast.ts'
import { useTrash } from '@/biblio/store/trash.ts'
import { useTriage } from '@/biblio/store/triage.ts'

const nf = new Intl.NumberFormat('fr-FR')
const s = (n: number) => (n > 1 ? 's' : '')
const originOf = (p: TriagePost) => (p.source === 'instagram' ? `Instagram · @${p.owner}` : `Pinterest · ${p.board ? `${p.board} · ` : ''}${p.owner}`)

async function reload() {
  await useGrid.getState().load()
  await useCollections.getState().load()
  await useTrash.getState().refresh()
  await useTriage.getState().refresh()
}

/** Le bandeau en haut de la bibliothèque : des images viennent d'arriver, on propose de les trier. */
export function TriageBanner() {
  const count = useTriage((st) => st.count)
  const lastResult = useLibrary((st) => st.lastResult)
  const phase = useLibrary((st) => st.phase)
  useEffect(() => {
    void useTriage.getState().refresh()
  }, [lastResult, phase])
  if (count === 0) return null
  const keepAll = async () => {
    await markTriaged()
    await useTriage.getState().refresh()
  }
  return (
    <div className="flex items-center gap-3 border-b px-4 py-2" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--accent) 8%, var(--bg))' }}>
      <Sparkles size={16} style={{ color: 'var(--accent)' }} />
      <span className="min-w-0 flex-1 text-sm"><b>{nf.format(count)}</b> nouvelle{s(count)} image{s(count)} arrivée{s(count)} d'Instagram et de Pinterest. Un coup d'œil pour enlever celles que tu ne voulais pas ?</span>
      <button className="btn btn-primary" onClick={() => useTriage.getState().show()}>Trier</button>
      <button className="btn" onClick={() => void keepAll()} title="Tout garder, sans trier">Tout garder</button>
    </div>
  )
}

/**
 * L'écran de tri : une ligne par post (un carrousel entier) ou par épingle. Tout est gardé au départ ; un clic sur une image la barre.
 * Clavier : ← → d'une image à l'autre, ↑ ↓ d'un post à l'autre, Suppr pour enlever / garder, Entrée pour le post suivant.
 * « Terminer le tri » met les images barrées dans la corbeille de Form (un bouton « Annuler » les remet).
 */
export function TriageView() {
  const open = useTriage((st) => st.open)
  if (!open) return null
  return <TriageScreen />
}

function TriageScreen() {
  const root = useLibrary((st) => st.root)
  const [thumbsDir, setThumbsDir] = useState(useGrid.getState().thumbsDir)
  const [posts, setPosts] = useState<TriagePost[] | null>(null)
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [cursor, setCursor] = useState({ post: 0, file: 0 })
  const [busy, setBusy] = useState(false)
  const openedAt = useRef(new Date().toISOString())
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    if (!thumbsDir) void invoke<string>('thumbs_dir').then(setThumbsDir).catch(() => undefined)
    void loadTriage().then(setPosts).catch(() => setPosts([]))
  }, [thumbsDir])

  const total = useMemo(() => posts?.reduce((n, p) => n + p.files.length, 0) ?? 0, [posts])
  const close = () => useTriage.getState().hide()

  const toggle = useCallback((rel: string) => setRemoved((r) => {
    const next = new Set(r)
    if (next.has(rel)) next.delete(rel)
    else next.add(rel)
    return next
  }), [])
  const setPost = useCallback((p: TriagePost, remove: boolean) => setRemoved((r) => {
    const next = new Set(r)
    for (const f of p.files) {
      if (remove) next.add(f.rel)
      else next.delete(f.rel)
    }
    return next
  }), [])

  const finish = async () => {
    if (!posts) return
    setBusy(true)
    try {
      const plan = triagePlan(posts, removed)
      await trashBlocks(plan.blocks)
      await trashFiles(plan.files)
      await markTriaged(openedAt.current)
      await reload()
      close()
      const n = removed.size
      if (n === 0) useToast.getState().show('Tri terminé : tout est gardé.')
      else {
        useToast.getState().show(`Tri terminé : ${nf.format(n)} image${s(n)} enlevée${s(n)} (dans la corbeille de Form).`, {
          label: 'Annuler',
          run: () => void (async () => {
            await restoreBlocks(plan.blocks)
            await restoreFiles(plan.files)
            await reload()
            useToast.getState().show('Les images enlevées sont de retour.')
          })(),
        })
      }
    } finally {
      setBusy(false)
    }
  }

  // Le clavier.
  useEffect(() => {
    if (!posts || posts.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const p = posts[cursor.post]
      const go = (post: number, file: number) => {
        const pi = Math.max(0, Math.min(posts.length - 1, post))
        setCursor({ post: pi, file: Math.max(0, Math.min(posts[pi].files.length - 1, file)) })
      }
      if (e.key === 'ArrowRight') {
        if (cursor.file < p.files.length - 1) go(cursor.post, cursor.file + 1)
        else go(cursor.post + 1, 0)
      } else if (e.key === 'ArrowLeft') {
        if (cursor.file > 0) go(cursor.post, cursor.file - 1)
        else if (cursor.post > 0) go(cursor.post - 1, posts[cursor.post - 1].files.length - 1)
      } else if (e.key === 'ArrowDown' || e.key === 'Enter') go(cursor.post + 1, 0)
      else if (e.key === 'ArrowUp') go(cursor.post - 1, 0)
      else if (e.key === 'Delete' || e.key === 'Backspace') toggle(p.files[cursor.file].rel)
      else if (e.key === 'Escape') close()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [posts, cursor, toggle])

  useEffect(() => {
    rowRefs.current[cursor.post]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [cursor.post])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: 'var(--bg)' }} role="dialog" aria-label="Trier les nouveautés">
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3" style={{ borderColor: 'var(--border)' }}>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold">Trier les nouveautés</div>
          <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>
            {posts ? `${nf.format(total)} image${s(total)} dans ${nf.format(posts.length)} post${s(posts.length)}. ` : ''}
            Tout est gardé ; clique sur une image pour l'enlever. Clavier : flèches pour avancer, Suppr pour enlever, Entrée pour le post suivant.
          </div>
        </div>
        <button className="btn" onClick={close} disabled={busy}>Plus tard</button>
        <button className="btn btn-primary" onClick={() => void finish()} disabled={busy || !posts}>
          <Check size={15} /> {busy ? 'Un instant…' : removed.size > 0 ? `Terminer le tri (${nf.format(removed.size)} à enlever)` : 'Terminer le tri'}
        </button>
        <button className="btn !px-2" onClick={close} aria-label="Fermer" title="Fermer (Échap)"><X size={16} /></button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {posts === null ? (
          <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>Ouverture…</p>
        ) : posts.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>Rien de nouveau à trier.</p>
        ) : (
          posts.map((p, pi) => {
            const gone = p.files.filter((f) => removed.has(f.rel)).length
            return (
              <div key={p.blockId} ref={(el) => { rowRefs.current[pi] = el }} className="mb-5 rounded-xl border p-3" style={{ borderColor: pi === cursor.post ? 'var(--accent)' : 'var(--border)' }}>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{originOf(p)}</span>
                  <span style={{ color: 'var(--fg-muted)' }}>
                    {p.files.length > 1 ? `carrousel de ${p.files.length} images` : '1 image'}{gone > 0 ? ` · ${gone === p.files.length ? 'tout enlevé' : `${gone} enlevée${s(gone)}`}` : ''}
                  </span>
                  <span className="flex-1" />
                  {gone > 0 && <button className="btn !py-0.5 !text-xs" onClick={() => setPost(p, false)}><Undo2 size={12} /> Garder tout</button>}
                  {gone < p.files.length && <button className="btn !py-0.5 !text-xs" onClick={() => setPost(p, true)}><Trash2 size={12} /> Enlever tout le post</button>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.files.map((f, fi) => {
                    const off = removed.has(f.rel)
                    const here = pi === cursor.post && fi === cursor.file
                    const src = f.thumb && thumbsDir ? fileUrl(thumbPath(thumbsDir, f.thumb)) : root ? fileUrl(originalPath(root, f.rel)) : ''
                    return (
                      <button
                        key={f.rel}
                        className="relative h-56 overflow-hidden rounded-lg"
                        style={{ outline: here ? '3px solid var(--accent)' : off ? '3px solid #d44c47' : 'none', outlineOffset: 1, background: 'var(--bg-hover)', minWidth: '6rem' }}
                        onClick={() => { setCursor({ post: pi, file: fi }); toggle(f.rel) }}
                        title={off ? 'Enlevée : clique pour la garder' : 'Clique pour l’enlever'}
                      >
                        {f.kind === 'video' && !f.thumb ? (
                          <video src={src} muted preload="metadata" className="h-full w-auto" style={{ opacity: off ? 0.25 : 1 }} />
                        ) : (
                          <img src={src} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-auto" style={{ opacity: off ? 0.25 : 1, filter: off ? 'grayscale(1)' : 'none' }} />
                        )}
                        {f.kind === 'video' && <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-white"><Play size={11} fill="currentColor" /></span>}
                        {p.files.length > 1 && <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">{fi + 1}/{p.files.length}</span>}
                        {off && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium text-white" style={{ background: '#d44c47' }}><Trash2 size={14} /> Enlevée</span>
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
