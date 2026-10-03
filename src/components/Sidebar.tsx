import { FileText, Moon, Plus, Settings, Sun, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import type { ObjectRow } from '@/lib/types'

function Item({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-[var(--bg-hover)]',
        active && 'bg-[var(--bg-hover)] font-medium',
      )}
    >
      {children}
    </button>
  )
}

function PageItem({ page }: { page: ObjectRow }) {
  const { selectedId, view, select } = useApp()
  return (
    <Item active={view === 'page' && selectedId === page.id} onClick={() => select(page.id)}>
      <FileText size={14} className="shrink-0 text-[var(--fg-muted)]" />
      <span className="truncate">{page.title || 'Sans titre'}</span>
    </Item>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="px-2 pb-1 pt-4 text-xs font-semibold text-[var(--fg-muted)]">{children}</div>
}

export function Sidebar() {
  const { objects, view, show, createPage, theme, toggleTheme } = useApp()
  const pages = objects.filter((o) => !o.deleted_at && o.type === 'page')
  const favorites = pages.filter((p) => p.is_favorite)

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-side)] p-2">
      <div className="px-2 py-2 text-base font-semibold">Form</div>

      {favorites.length > 0 && (
        <>
          <Label>Favoris</Label>
          {favorites.map((p) => <PageItem key={p.id} page={p} />)}
        </>
      )}

      <Label>Pages</Label>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {pages.map((p) => <PageItem key={p.id} page={p} />)}
        {pages.length === 0 && <div className="px-2 text-sm text-[var(--fg-muted)]">Aucune page</div>}
      </div>
      <Item onClick={createPage}>
        <Plus size={14} /> Nouvelle page
      </Item>

      <div className="mt-2 border-t border-[var(--border)] pt-2">
        <Item active={view === 'trash'} onClick={() => show('trash')}>
          <Trash2 size={14} /> Corbeille
        </Item>
        <Item active={view === 'settings'} onClick={() => show('settings')}>
          <Settings size={14} /> Réglages
        </Item>
        <Item onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          {theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
        </Item>
      </div>
    </aside>
  )
}
