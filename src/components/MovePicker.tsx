import { useState } from 'react'
import { Home } from 'lucide-react'
import { isDescendant } from '@/lib/tree'
import { normalize } from '@/lib/search'
import { useApp } from '@/store/app'
import { Icon } from '@/components/Icon'

/** Fenêtre « Déplacer vers… » : choisir la nouvelle page parente. */
export function MovePicker({ id }: { id: string }) {
  const { objects, moveTo, setMoving } = useApp()
  const [query, setQuery] = useState('')
  const page = objects.find((o) => o.id === id)
  const q = normalize(query).trim()
  // On ne peut pas déplacer une page dans elle-même, dans ses sous-pages, ni dans une base de données.
  const targets = objects
    .filter((o) => o.type === 'page' && !o.deleted_at && o.id !== id && !isDescendant(objects, id, o.id))
    .filter((o) => q === '' || normalize(o.title).includes(q))
    .slice(0, 50)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]" onMouseDown={() => setMoving(null)}>
      <div className="w-[460px] max-w-[90vw] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="border-b border-[var(--border)] px-4 py-2 text-sm font-semibold">
          Déplacer « {page?.title || 'Sans titre'} » vers…
        </div>
        <input
          autoFocus
          value={query}
          placeholder="Chercher une page"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setMoving(null)}
          className="w-full border-b border-[var(--border)] bg-transparent px-4 py-2 text-sm outline-none"
        />
        <div className="max-h-[50vh] overflow-y-auto p-1">
          <button onClick={() => void moveTo(id, null)} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-[var(--bg-hover)]">
            <Home size={14} /> Racine (en haut de la liste)
          </button>
          {targets.map((o) => (
            <button key={o.id} onClick={() => void moveTo(id, o.id)} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-[var(--bg-hover)]">
              <Icon value={o.icon ?? '📄'} size={16} />
              <span className="truncate">{o.title || 'Sans titre'}</span>
            </button>
          ))}
          {targets.length === 0 && <div className="px-3 py-3 text-sm text-[var(--fg-muted)]">Aucune page.</div>}
        </div>
      </div>
    </div>
  )
}
