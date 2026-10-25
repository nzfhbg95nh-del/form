import { useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2, X } from 'lucide-react'
import { loadCollectionBlocks, type CollectionCard } from '@/biblio/lib/collections.ts'
import { fileUrl, thumbPath } from '@/biblio/lib/media.ts'
import { useCollections } from '@/biblio/store/collections.ts'
import { useGrid } from '@/biblio/store/grid.ts'

const label = 'mb-1.5 block text-sm font-medium'
const field = 'w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--accent)]'
const fieldStyle = { borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }

/** Combien d'images on propose pour choisir la couverture (les plus récentes d'abord). */
const PICK_LIMIT = 120

/** « Modifier ton tableau » : couverture, nom et description d'une de mes collections, et sa suppression. */
export function CollectionSettings({ card, onClose }: { card: CollectionCard; onClose: () => void }) {
  const { update, remove } = useCollections()
  const blocks = useGrid((s) => s.blocks)
  const thumbsDir = useGrid((s) => s.thumbsDir)
  const [name, setName] = useState(card.name)
  const [description, setDescription] = useState(card.description)
  const [coverBlock, setCoverBlock] = useState<string | null>(card.coverBlock)
  const [picking, setPicking] = useState(false)
  const [ids, setIds] = useState<Set<string> | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadCollectionBlocks(card.id).then((s) => {
      if (!cancelled) setIds(s)
    })
    return () => {
      cancelled = true
    }
  }, [card.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Les images de la collection qui ont une miniature.
  const choices = useMemo(() => (ids ? blocks.filter((b) => ids.has(b.id) && b.thumb).slice(0, PICK_LIMIT) : []), [blocks, ids])
  const coverThumb = useMemo(() => {
    if (coverBlock) {
      const b = blocks.find((x) => x.id === coverBlock)
      if (b?.thumb) return b.thumb
    }
    return card.previews[0] ?? null
  }, [coverBlock, blocks, card.previews])

  const save = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    await update(card.id, { name, description, coverBlock })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-6" onMouseDown={onClose}>
      <div
        className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-3xl shadow-2xl"
        style={{ background: 'var(--bg)' }}
        role="dialog"
        aria-label="Modifier le tableau"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="relative px-8 pb-2 pt-7 text-center">
          <h2 className="text-xl font-semibold">Modifier ton tableau</h2>
          <button className="absolute right-5 top-5 rounded-full p-2 hover:bg-[var(--bg-hover)]" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-8 pb-4 pt-4">
          <span className={label}>Couverture du tableau</span>
          <div className="mb-6 flex items-start gap-4">
            <button className="group relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl" style={{ background: 'var(--bg-hover)' }} onClick={() => setPicking(!picking)} aria-label="Changer la couverture">
              {coverThumb && <img src={fileUrl(thumbPath(thumbsDir, coverThumb))} alt="" draggable={false} className="h-full w-full object-cover" />}
              <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/85 text-black shadow"><Pencil size={14} /></span>
            </button>
            <div className="text-sm" style={{ color: 'var(--fg-muted)' }}>
              C'est la grande image de la carte du tableau. Choisis-en une parmi celles du tableau.
              {coverBlock && (
                <div><button className="mt-2 underline" onClick={() => setCoverBlock(null)}>Revenir à la couverture automatique</button></div>
              )}
            </div>
          </div>

          {picking && (
            <div className="mb-6 rounded-2xl border p-2" style={{ borderColor: 'var(--border)' }}>
              {ids === null ? (
                <div className="p-3 text-sm" style={{ color: 'var(--fg-muted)' }}>Chargement…</div>
              ) : choices.length === 0 ? (
                <div className="p-3 text-sm" style={{ color: 'var(--fg-muted)' }}>Ce tableau n'a pas encore d'image. Range-en dedans, puis choisis la couverture.</div>
              ) : (
                <div className="grid max-h-64 grid-cols-5 gap-1.5 overflow-auto">
                  {choices.map((b) => (
                    <button
                      key={b.id}
                      className="aspect-square overflow-hidden rounded-lg"
                      style={{ outline: coverBlock === b.id ? '3px solid var(--accent)' : 'none', outlineOffset: -3, background: 'var(--bg-hover)' }}
                      onClick={() => { setCoverBlock(b.id); setPicking(false) }}
                      aria-label="Choisir cette image"
                    >
                      <img src={fileUrl(thumbPath(thumbsDir, b.thumb as string))} alt="" draggable={false} loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <label className={label} htmlFor="cs-name">Nom</label>
          <input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save() }} className={`${field} mb-5`} style={fieldStyle} />

          <label className={label} htmlFor="cs-desc">Description</label>
          <textarea id="cs-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Quel est le thème de ce tableau ?" className={`${field} mb-2 resize-y`} style={fieldStyle} />
        </div>

        <div className="flex items-center gap-3 border-t px-8 py-4" style={{ borderColor: 'var(--border)' }}>
          {confirmDelete ? (
            <div className="flex items-center gap-2 text-sm">
              Supprimer ce tableau et ses sous-tableaux ? Les images restent dans la bibliothèque.
              <button className="btn" onClick={() => void remove(card.id).then(onClose)}>Supprimer</button>
              <button className="btn" onClick={() => setConfirmDelete(false)}>Non</button>
            </div>
          ) : (
            <>
              <button className="btn" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Supprimer</button>
              <button className="btn ml-auto" onClick={onClose}>Annuler</button>
              <button className="rounded-lg px-5 py-2 text-sm font-medium text-white disabled:opacity-40" style={{ background: 'var(--accent)' }} disabled={!name.trim() || saving} onClick={() => void save()}>Enregistrer</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
