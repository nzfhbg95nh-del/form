import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ChevronLeft, RotateCcw, Trash2, X } from 'lucide-react'
import { fileUrl, originalPath, thumbPath } from '@/biblio/lib/media.ts'
import { loadTrash, type TrashedItem } from '@/biblio/lib/trash.ts'
import { splitTrashSelection } from '@/biblio/lib/trashPlan.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import { useTrash } from '@/biblio/store/trash.ts'

const nf = new Intl.NumberFormat('fr-FR')
const PAGE = 300

const label = (item: TrashedItem) =>
  item.type === 'file' ? 'Une image d\'un carrousel' : item.count > 1 ? `Carrousel · ${item.count} images` : null

const origin = (item: TrashedItem) => (item.source === 'instagram' ? `@${item.owner}` : item.source === 'manual' ? 'Image ajoutée' : `${item.board ?? ''} · ${item.owner}`)

/**
 * La corbeille de la bibliothèque : restaurer des images (un clic sur « Restaurer », ou une sélection), les voir en grand (double-clic),
 * ou les supprimer définitivement (fichiers dans la Corbeille Windows).
 * `onBack` : bouton retour (depuis les Réglages) ; absent dans la Corbeille de la barre latérale.
 */
export function TrashView({ onBack }: { onBack?: () => void }) {
  const { restore, purge, purgeFiles, count, refresh } = useTrash()
  const gridThumbs = useGrid((s) => s.thumbsDir)
  const root = useLibrary((s) => s.root)
  const [thumbsDir, setThumbsDir] = useState(gridThumbs)
  const [items, setItems] = useState<TrashedItem[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [shown, setShown] = useState(PAGE)
  const [confirm, setConfirm] = useState<Set<string> | null>(null)
  const [preview, setPreview] = useState<TrashedItem | null>(null)
  const [busy, setBusy] = useState(false)

  // Le dossier des miniatures est connu dès que la bibliothèque a été ouverte ; sinon on le demande.
  useEffect(() => {
    if (gridThumbs) setThumbsDir(gridThumbs)
    else void invoke<string>('thumbs_dir').then(setThumbsDir).catch(() => undefined)
  }, [gridThumbs])
  useEffect(() => {
    void refresh().catch(() => undefined)
  }, [refresh])
  useEffect(() => {
    void loadTrash().then(setItems).catch(() => setItems([]))
  }, [count])

  const keys = useMemo(() => new Set((items ?? []).map((i) => i.key)), [items])
  const chosen = useMemo(() => new Set([...selected].filter((k) => keys.has(k))), [selected, keys])
  const toggle = (key: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const doRestore = async (which: Set<string>) => {
    if (!items || which.size === 0) return
    setBusy(true)
    try {
      const { blockIds, rels } = splitTrashSelection(items, which)
      await restore(blockIds, rels)
      setSelected((s) => new Set([...s].filter((k) => !which.has(k))))
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }
  const doPurge = async (which: Set<string>) => {
    if (!items) return
    setBusy(true)
    try {
      const { blockIds, rels } = splitTrashSelection(items, which)
      if (blockIds.length > 0) await purge(blockIds)
      if (rels.length > 0) await purgeFiles(rels)
    } finally {
      setSelected((s) => new Set([...s].filter((k) => !which.has(k))))
      setConfirm(null)
      setPreview(null)
      setBusy(false)
    }
  }

  const muted = { color: 'var(--fg-muted)' }
  const big = preview && root ? originalPath(root, preview.rel) : null

  return (
    <div className={onBack ? 'mx-auto max-w-5xl p-8' : ''}>
      {onBack && (
        <>
          <button className="btn" onClick={onBack}><ChevronLeft size={15} /> Réglages</button>
          <h1 className="mt-4 text-3xl font-bold">Corbeille des images</h1>
        </>
      )}
      <p className="mt-1 text-sm" style={muted}>
        Les images mises à la corbeille ont disparu de la bibliothèque, mais leurs fichiers sont toujours sur ton disque. « Restaurer » les remet là où elles étaient
        (mêmes tableaux, même carrousel). Double-clic sur une image pour la voir en grand. « Supprimer définitivement » envoie les fichiers dans la Corbeille Windows
        (tu peux encore les y récupérer), et Form ne les réimporte plus.
      </p>

      {items === null ? null : items.length === 0 ? (
        <p className="mt-8 text-sm" style={muted}>Aucune image dans la corbeille.</p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-sm">{nf.format(items.length)} élément{items.length > 1 ? 's' : ''}{chosen.size > 0 ? ` · ${chosen.size} sélectionné${chosen.size > 1 ? 's' : ''}` : ''}</span>
            {chosen.size > 0 ? (
              <button className="btn ml-auto" onClick={() => setSelected(new Set())}>Tout désélectionner</button>
            ) : (
              <button className="btn ml-auto" onClick={() => setSelected(new Set(keys))}>Tout sélectionner</button>
            )}
            <button className="btn" disabled={chosen.size === 0 || busy} onClick={() => void doRestore(chosen)}><RotateCcw size={15} /> Restaurer</button>
            <button className="btn" disabled={chosen.size === 0 || busy} onClick={() => setConfirm(chosen)}><Trash2 size={15} /> Supprimer définitivement</button>
          </div>

          <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
            {items.slice(0, shown).map((item) => {
              const isOn = chosen.has(item.key)
              const tag = label(item)
              return (
                <div
                  key={item.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(item.key)}
                  onDoubleClick={() => setPreview(item)}
                  onKeyDown={(e) => {
                    if (e.key === ' ') { e.preventDefault(); toggle(item.key) }
                    if (e.key === 'Enter') setPreview(item)
                  }}
                  className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg"
                  style={{ background: 'var(--bg-hover)', outline: isOn ? '3px solid var(--accent)' : 'none', outlineOffset: -3 }}
                  aria-pressed={isOn}
                  aria-label={`${origin(item)}${tag ? ` (${tag})` : ''}`}
                  title={`${origin(item)}${tag ? ` · ${tag}` : ''}`}
                >
                  {item.thumb && thumbsDir && <img src={fileUrl(thumbPath(thumbsDir, item.thumb))} alt="" draggable={false} loading="lazy" className="h-full w-full object-cover" />}
                  {isOn && <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-xs text-white" style={{ background: 'var(--accent)' }}>✓</span>}
                  {tag && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-white">{tag}</span>}
                  <button
                    className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/65 px-2 py-1 text-xs text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation()
                      void doRestore(new Set([item.key]))
                    }}
                    title="Remettre cette image dans la bibliothèque"
                  >
                    <RotateCcw size={12} /> Restaurer
                  </button>
                </div>
              )
            })}
          </div>
          {items.length > shown && <button className="btn mt-4" onClick={() => setShown(shown + PAGE)}>Afficher les {nf.format(Math.min(PAGE, items.length - shown))} suivantes</button>}
        </>
      )}

      {preview && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-black/85 p-6" onMouseDown={() => setPreview(null)} role="dialog" aria-label="Aperçu">
          <div className="flex items-center gap-2 text-sm text-white" onMouseDown={(e) => e.stopPropagation()}>
            <span className="mr-auto">{origin(preview)}{label(preview) ? ` · ${label(preview)}` : ''}</span>
            <button className="btn" disabled={busy} onClick={() => void doRestore(new Set([preview.key]))}><RotateCcw size={15} /> Restaurer</button>
            <button className="btn" disabled={busy} onClick={() => setConfirm(new Set([preview.key]))}><Trash2 size={15} /> Supprimer définitivement</button>
            <button className="btn" onClick={() => setPreview(null)} aria-label="Fermer"><X size={15} /></button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center pt-4">
            {big && preview.kind === 'video' ? (
              <video src={fileUrl(big)} controls autoPlay muted loop className="max-h-full max-w-full rounded-md" onMouseDown={(e) => e.stopPropagation()} />
            ) : big ? (
              <img src={fileUrl(big)} alt="" className="max-h-full max-w-full rounded-md object-contain" onMouseDown={(e) => e.stopPropagation()} />
            ) : null}
          </div>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-6" onMouseDown={() => !busy && setConfirm(null)}>
          <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl" style={{ background: 'var(--bg)' }} role="dialog" aria-label="Supprimer définitivement" onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Supprimer définitivement ?</h2>
            <p className="mt-2 text-sm">
              {confirm.size} élément{confirm.size > 1 ? 's' : ''} : les fichiers vont dans la <b>Corbeille Windows</b> et Form les oublie
              (ils ne reviendront pas, même si les fichiers reviennent dans le dossier). Tu pourras encore récupérer les fichiers dans la Corbeille Windows.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn" disabled={busy} onClick={() => setConfirm(null)}>Annuler</button>
              <button className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: '#d44c47' }} disabled={busy} onClick={() => void doPurge(confirm)}>
                {busy ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
