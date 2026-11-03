import { ChevronRight } from 'lucide-react'
import { Icon } from '@/components/Icon'
import { pathTo } from '@/lib/tree'
import { useApp } from '@/store/app'

/** Bloc « Fil d'Ariane » : le chemin de la page (page parente / … / cette page), chaque étape est cliquable. */
export function BreadcrumbBlock() {
  const objects = useApp((s) => s.objects)
  const selectedId = useApp((s) => s.selectedId)
  const select = useApp((s) => s.select)
  const trail = selectedId ? pathTo(objects, selectedId) : []
  return (
    <nav contentEditable={false} aria-label="Fil d'Ariane" className="flex w-full flex-wrap items-center gap-1 py-1 text-sm text-[var(--fg-muted)]">
      {trail.length === 0 && <span>Cette page n'est pas encore dans la liste.</span>}
      {trail.map((p, i) => (
        <span key={p.id} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={13} aria-hidden />}
          <button
            type="button"
            aria-current={i === trail.length - 1 ? 'page' : undefined}
            onClick={() => select(p.id)}
            className={'flex items-center gap-1 rounded px-1 py-0.5 hover:bg-[var(--bg-hover)] hover:text-[var(--fg)] ' + (i === trail.length - 1 ? 'text-[var(--fg)]' : '')}
          >
            <Icon value={p.icon ?? '📄'} size={14} />
            <span className="max-w-48 truncate">{p.title || 'Nouvelle page'}</span>
          </button>
        </span>
      ))}
    </nav>
  )
}