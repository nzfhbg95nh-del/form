import { useEffect, useState } from 'react'
import { useApp } from '@/store/app'
import { askConfirm } from '@/lib/confirm'
import { TrashView as ImagesTrash } from '@/biblio/components/TrashView.tsx'
import { useTrash } from '@/biblio/store/trash.ts'

/** La corbeille de Form : les images de la bibliothèque et les pages, au même endroit. */
export function TrashView() {
  const { objects, restore, purge } = useApp()
  const imageCount = useTrash((s) => s.count)
  const refreshImages = useTrash((s) => s.refresh)
  // On n'affiche que les pages « de tête » : leurs sous-pages reviennent avec elles.
  const trashed = objects.filter((o) => {
    if (!o.deleted_at) return false
    const parent = objects.find((p) => p.id === o.parent_id)
    return !(parent && parent.deleted_at === o.deleted_at)
  })
  const [tab, setTab] = useState<'images' | 'pages' | null>(null)
  useEffect(() => {
    void refreshImages().catch(() => undefined)
  }, [refreshImages])
  // Par défaut, l'onglet qui a quelque chose à montrer.
  const current = tab ?? (imageCount === 0 && trashed.length > 0 ? 'pages' : 'images')

  const tabStyle = (on: boolean) => ({
    borderBottom: on ? '2px solid var(--fg)' : '2px solid transparent',
    color: on ? 'var(--fg)' : 'var(--fg-muted)',
  })

  return (
    <div className="mx-auto max-w-5xl px-12 py-10">
      <h1 className="mb-4 text-3xl font-bold">Corbeille</h1>
      <div className="mb-4 flex gap-5 border-b border-[var(--border)] text-sm" role="tablist">
        <button role="tab" aria-selected={current === 'images'} className="pb-2 font-medium" style={tabStyle(current === 'images')} onClick={() => setTab('images')}>
          Images ({imageCount})
        </button>
        <button role="tab" aria-selected={current === 'pages'} className="pb-2 font-medium" style={tabStyle(current === 'pages')} onClick={() => setTab('pages')}>
          Pages ({trashed.length})
        </button>
      </div>

      {current === 'images' ? (
        <ImagesTrash />
      ) : (
        <>
          {trashed.length === 0 && <p className="text-[var(--fg-muted)]">Aucune page dans la corbeille.</p>}
          {trashed.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-b border-[var(--border)] py-2">
              <span>{p.title || 'Nouvelle page'}</span>
              <span className="flex gap-3 text-sm">
                <button className="text-[var(--accent)]" onClick={() => restore(p.id)}>Restaurer</button>
                <button
                  className="text-red-500"
                  onClick={async () => {
                    if (await askConfirm('Supprimer définitivement cette page ? Impossible de revenir en arrière.')) void purge(p.id)
                  }}
                >
                  Supprimer définitivement
                </button>
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
