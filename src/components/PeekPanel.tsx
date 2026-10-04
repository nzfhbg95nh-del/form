import { Maximize2, X } from 'lucide-react'
import { DatabaseView } from '@/components/DatabaseView'
import { PageView } from '@/components/PageView'
import { useApp } from '@/store/app'

/** Aperçu latéral : une page à droite, sans quitter la page en cours. */
export function PeekPanel({ id }: { id: string }) {
  const { objects, closePeek, select } = useApp()
  const page = objects.find((o) => o.id === id && !o.deleted_at)

  return (
    <aside className="flex h-full w-[45%] min-w-[340px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg)] shadow-xl">
      <div className="flex items-center gap-1 border-b border-[var(--border)] px-2 py-1">
        <button
          title="Ouvrir en pleine page"
          onClick={() => { closePeek(); select(id) }}
          className="flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-[var(--bg-hover)]"
        >
          <Maximize2 size={14} /> Ouvrir en pleine page
        </button>
        <div className="flex-1" />
        <button title="Fermer l'aperçu" onClick={closePeek} className="rounded p-1 hover:bg-[var(--bg-hover)]"><X size={16} /></button>
      </div>
      <div className="min-h-0 flex-1">
        {page ? (
          page.type === 'database' ? <DatabaseView key={page.id} db={page} /> : <PageView key={page.id} pageId={page.id} />
        ) : (
          <p className="p-6 text-sm text-[var(--fg-muted)]">Cette page n'existe plus.</p>
        )}
      </div>
    </aside>
  )
}
