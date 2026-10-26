import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { libraryCover, pickableBlocks } from '@/biblio/lib/coverPick.ts'
import { fileUrl, thumbPath } from '@/biblio/lib/media.ts'
import { useGrid } from '@/biblio/store/grid.ts'

/**
 * « Depuis ma bibliothèque… » : une grille de mes images avec une recherche. Un clic choisit l'image, qui est copiée (réduite) comme couverture ;
 * le fichier de la bibliothèque n'est pas touché.
 */
export function LibraryImagePicker({ onPick, onClose }: { onPick: (dataUrl: string) => void; onClose: () => void }) {
  const blocks = useGrid((s) => s.blocks)
  const loaded = useGrid((s) => s.loaded)
  const typeIndex = useGrid((s) => s.typeIndex)
  const thumbsDir = useGrid((s) => s.thumbsDir)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loaded) void useGrid.getState().load()
  }, [loaded])

  const shown = useMemo(() => pickableBlocks(blocks, query, typeIndex), [blocks, query, typeIndex])

  const choose = async (id: string) => {
    const block = blocks.find((b) => b.id === id)
    if (!block) return
    setBusy(true)
    setError(null)
    const url = await libraryCover(block)
    setBusy(false)
    if (url) onPick(url)
    else setError("Impossible de lire cette image : essaie-en une autre.")
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Choisir une image de ma bibliothèque"
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl p-4 shadow-2xl"
        style={{ background: 'var(--bg)', color: 'var(--fg)' }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex-1 text-base font-semibold">Choisir une image de ma bibliothèque</h2>
          <button className="rounded p-1 hover:bg-[var(--bg-hover)]" onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--fg-muted)' }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Chercher (auteur, tableau, texte…)"
            aria-label="Chercher une image"
            className="w-full rounded-full border py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)]"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
          />
        </div>
        {error && <p className="mb-2 text-sm" style={{ color: '#d44c47' }}>{error}</p>}
        {!loaded ? (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>Ouverture de la bibliothèque…</p>
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>{blocks.length === 0 ? 'Ta bibliothèque est vide.' : 'Aucune image ne correspond.'}</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
              {shown.map((b) => (
                <button
                  key={b.id}
                  disabled={busy}
                  onClick={() => void choose(b.id)}
                  className="aspect-square overflow-hidden rounded-lg disabled:opacity-60"
                  style={{ background: 'var(--bg-hover)' }}
                  title={b.source === 'instagram' ? `@${b.owner}` : `${b.board ?? ''} · ${b.owner}`}
                >
                  {b.thumb && <img src={fileUrl(thumbPath(thumbsDir, b.thumb))} alt="" draggable={false} loading="lazy" className="h-full w-full object-cover" />}
                </button>
              ))}
            </div>
            {shown.length >= 150 && <p className="mt-2 text-center text-xs" style={{ color: 'var(--fg-muted)' }}>Les 150 premières : précise ta recherche pour en voir d'autres.</p>}
          </div>
        )}
        {busy && <p className="mt-2 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>Préparation de l'image…</p>}
      </div>
    </div>
  )
}
