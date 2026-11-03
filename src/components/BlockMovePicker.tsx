import { useState } from 'react'
import { normalize } from '@/lib/search'
import { useApp } from '@/store/app'
import { useBlockMove } from '@/store/blockMove'
import { Icon } from '@/components/Icon'

/** Fenêtre « Déplacer ce bloc vers… » : choisir la page où le bloc ira (à la fin de cette page). */
export function BlockMovePicker() {
  const onPick = useBlockMove((s) => s.onPick)
  const from = useBlockMove((s) => s.from)
  const close = useBlockMove((s) => s.close)
  const objects = useApp((s) => s.objects)
  const [query, setQuery] = useState('')
  if (!onPick) return null
  const q = normalize(query).trim()
  const targets = objects
    .filter((o) => o.type === 'page' && !o.deleted_at && o.id !== from)
    .filter((o) => q === '' || normalize(o.title).includes(q))
    .slice(0, 50)
  const choose = (id: string) => {
    close()
    void onPick(id)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]" onMouseDown={close}>
      <div role="dialog" aria-modal="true" aria-label="Déplacer le bloc" className="w-[460px] max-w-[90vw] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="border-b border-[var(--border)] px-4 py-2 text-sm font-semibold">Déplacer ce bloc vers…</div>
        <input
          autoFocus
          value={query}
          placeholder="Chercher une page"
          aria-label="Chercher une page"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
            else if (e.key === 'Enter' && targets[0]) choose(targets[0].id)
          }}
          className="w-full border-b border-[var(--border)] bg-transparent px-4 py-2 text-sm outline-none"
        />
        <div className="max-h-[50vh] overflow-y-auto p-1">
          {targets.map((o) => (
            <button key={o.id} onClick={() => choose(o.id)} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-[var(--bg-hover)]">
              <Icon value={o.icon ?? '📄'} size={16} />
              <span className="truncate">{o.title || 'Nouvelle page'}</span>
            </button>
          ))}
          {targets.length === 0 && <div className="px-3 py-3 text-sm text-[var(--fg-muted)]">Aucune page.</div>}
        </div>
      </div>
    </div>
  )
}