import { Fragment } from 'react'
import { Database, FileText, Images } from 'lucide-react'
import { Icon } from '@/components/Icon'
import { pathTo } from '@/lib/tree'
import { useApp } from '@/store/app'
import type { ObjectRow } from '@/lib/types'

function Glyph({ o }: { o: ObjectRow }) {
  if (o.icon) return <Icon value={o.icon} size={16} />
  const cls = 'shrink-0 text-[var(--fg-muted)]'
  if (o.type === 'database') return <Database size={16} strokeWidth={1.5} className={cls} />
  if (o.type === 'moodboard') return <Images size={16} strokeWidth={1.5} className={cls} />
  return <FileText size={16} strokeWidth={1.5} className={cls} />
}

/** Le chemin de la page ouverte, comme dans Notion : Page parente / Sous-page / Page. Chaque étape est cliquable. */
export function Breadcrumb({ id }: { id: string }) {
  const objects = useApp((s) => s.objects)
  const select = useApp((s) => s.select)
  const path = pathTo(objects, id)
  if (path.length === 0) return null
  return (
    <nav aria-label="Chemin de la page" className="flex items-center gap-1 overflow-x-auto px-3 py-1.5 text-sm text-[var(--fg-muted)]">
      {path.map((o, i) => {
        const last = i === path.length - 1
        return (
          <Fragment key={o.id}>
            {i > 0 && <span aria-hidden className="px-0.5 text-[var(--border)]">/</span>}
            <button
              disabled={last}
              onClick={() => select(o.id)}
              aria-current={last ? 'page' : undefined}
              className={'flex min-w-0 max-w-[220px] items-center gap-1.5 rounded-md px-1.5 py-0.5 ' + (last ? 'cursor-default text-[var(--fg)]' : 'hover:bg-[var(--bg-hover)]')}
            >
              <Glyph o={o} />
              <span className="truncate">{o.title || 'Nouvelle page'}</span>
            </button>
          </Fragment>
        )
      })}
    </nav>
  )
}
