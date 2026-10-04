import { useApp } from '@/store/app'

export function TrashView() {
  const { objects, restore, purge } = useApp()
  // On n'affiche que les pages « de tête » : leurs sous-pages reviennent avec elles.
  const trashed = objects.filter((o) => {
    if (!o.deleted_at) return false
    const parent = objects.find((p) => p.id === o.parent_id)
    return !(parent && parent.deleted_at === o.deleted_at)
  })

  return (
    <div className="mx-auto max-w-3xl px-12 py-10">
      <h1 className="mb-6 text-3xl font-bold">Corbeille</h1>
      {trashed.length === 0 && <p className="text-[var(--fg-muted)]">La corbeille est vide.</p>}
      {trashed.map((p) => (
        <div key={p.id} className="flex items-center justify-between border-b border-[var(--border)] py-2">
          <span>{p.title || 'Nouvelle page'}</span>
          <span className="flex gap-3 text-sm">
            <button className="text-[var(--accent)]" onClick={() => restore(p.id)}>Restaurer</button>
            <button
              className="text-red-500"
              onClick={() => {
                if (window.confirm('Supprimer définitivement cette page ? Impossible de revenir en arrière.')) void purge(p.id)
              }}
            >
              Supprimer définitivement
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}
