import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, RotateCcw, Trash2 } from 'lucide-react'
import { fileUrl, thumbPath } from '@/biblio/lib/media.ts'
import { loadTrash, type TrashedBlock } from '@/biblio/lib/trash.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { useTrash } from '@/biblio/store/trash.ts'

const nf = new Intl.NumberFormat('fr-FR')
const PAGE = 300

/** La corbeille de la bibliothèque : restaurer des images, ou les supprimer définitivement (fichiers dans la Corbeille Windows). */
export function TrashView({ onBack }: { onBack: () => void }) {
  const { restore, purge, count } = useTrash()
  const thumbsDir = useGrid((s) => s.thumbsDir)
  const [items, setItems] = useState<TrashedBlock[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [shown, setShown] = useState(PAGE)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const reload = () => void loadTrash().then(setItems)
  useEffect(reload, [count])

  const ids = useMemo(() => (items ?? []).map((i) => i.id), [items])
  const chosen = selected.size > 0 ? [...selected].filter((id) => ids.includes(id)) : []
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const doRestore = async () => {
    setBusy(true)
    await restore(chosen)
    setSelected(new Set())
    setBusy(false)
  }
  const doPurge = async () => {
    setBusy(true)
    try {
      await purge(chosen)
    } finally {
      setSelected(new Set())
      setConfirm(false)
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <button className="btn" onClick={onBack}><ChevronLeft size={15} /> Paramètres</button>
      <h1 className="mt-4 text-xl font-semibold">Corbeille</h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--fg-muted)' }}>
        Les images mises à la corbeille ont disparu de la bibliothèque, mais leurs fichiers sont toujours sur ton disque. « Restaurer » les remet là où elles étaient.
        « Supprimer définitivement » envoie leurs fichiers dans la Corbeille Windows (tu peux encore les y récupérer), et Form ne les réimporte plus.
      </p>

      {items === null ? null : items.length === 0 ? (
        <p className="mt-8 text-sm" style={{ color: 'var(--fg-muted)' }}>La corbeille est vide.</p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-sm">{nf.format(items.length)} image{items.length > 1 ? 's' : ''}{chosen.length > 0 ? ` · ${chosen.length} sélectionnée${chosen.length > 1 ? 's' : ''}` : ''}</span>
            <button className="btn ml-auto" onClick={() => setSelected(new Set(ids))}>Tout sélectionner</button>
            <button className="btn" disabled={chosen.length === 0 || busy} onClick={() => void doRestore()}><RotateCcw size={15} /> Restaurer</button>
            <button className="btn" disabled={chosen.length === 0 || busy} onClick={() => setConfirm(true)}><Trash2 size={15} /> Supprimer définitivement</button>
          </div>

          <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
            {items.slice(0, shown).map((b) => (
              <button
                key={b.id}
                onClick={() => toggle(b.id)}
                className="relative aspect-square overflow-hidden rounded-lg"
                style={{ background: 'var(--bg-hover)', outline: selected.has(b.id) ? '3px solid var(--accent)' : 'none', outlineOffset: -3 }}
                aria-pressed={selected.has(b.id)}
                title={b.source === 'instagram' ? `@${b.owner}` : `${b.board ?? ''} · ${b.owner}`}
              >
                {b.thumb && <img src={fileUrl(thumbPath(thumbsDir, b.thumb))} alt="" draggable={false} loading="lazy" className="h-full w-full object-cover" />}
                {selected.has(b.id) && <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-xs text-white" style={{ background: 'var(--accent)' }}>✓</span>}
              </button>
            ))}
          </div>
          {items.length > shown && <button className="btn mt-4" onClick={() => setShown(shown + PAGE)}>Afficher les {nf.format(Math.min(PAGE, items.length - shown))} suivantes</button>}
        </>
      )}

      {confirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-6" onMouseDown={() => !busy && setConfirm(false)}>
          <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl" style={{ background: 'var(--bg)' }} role="dialog" aria-label="Supprimer définitivement" onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Supprimer définitivement ?</h2>
            <p className="mt-2 text-sm">
              {chosen.length} image{chosen.length > 1 ? 's' : ''} : leurs fichiers vont dans la <b>Corbeille Windows</b> et Form les oublie
              (elles ne reviendront pas, même si Social Saver remet les fichiers). Tu pourras encore récupérer les fichiers dans la Corbeille Windows.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn" disabled={busy} onClick={() => setConfirm(false)}>Annuler</button>
              <button className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: '#d44c47' }} disabled={busy} onClick={() => void doPurge()}>
                {busy ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
