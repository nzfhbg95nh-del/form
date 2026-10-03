import { useState } from 'react'
import { ChevronRight, FileText, Moon, Plus, Settings, Sun, Trash2 } from 'lucide-react'
import { childrenOf, type DropZone } from '@/lib/tree'
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

function Label({ children }: { children: React.ReactNode }) {
  return <div className="px-2 pb-1 pt-4 text-xs font-semibold text-[var(--fg-muted)]">{children}</div>
}

interface DragState {
  dragId: string | null
  over: { id: string; zone: DropZone } | null
}

function TreeItem({
  page,
  depth,
  drag,
  setDrag,
}: {
  page: ObjectRow
  depth: number
  drag: DragState
  setDrag: (d: DragState) => void
}) {
  const { objects, selectedId, view, select, expanded, toggleExpanded, createPage, move } = useApp()
  const kids = childrenOf(objects, page.id)
  const open = !!expanded[page.id]
  const active = view === 'page' && selectedId === page.id
  const over = drag.over?.id === page.id ? drag.over.zone : null

  const zoneAt = (e: React.DragEvent<HTMLDivElement>): DropZone => {
    const r = e.currentTarget.getBoundingClientRect()
    const y = (e.clientY - r.top) / r.height
    return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'into'
  }

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', page.id)
          setDrag({ dragId: page.id, over: null })
        }}
        onDragEnd={() => setDrag({ dragId: null, over: null })}
        onDragOver={(e) => {
          if (!drag.dragId || drag.dragId === page.id) return
          e.preventDefault()
          const zone = zoneAt(e)
          if (drag.over?.id !== page.id || drag.over.zone !== zone) setDrag({ ...drag, over: { id: page.id, zone } })
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (drag.dragId) void move(drag.dragId, page.id, zoneAt(e))
          setDrag({ dragId: null, over: null })
        }}
        className={cn(
          'group relative flex items-center gap-1 rounded py-1 pr-1 text-sm hover:bg-[var(--bg-hover)]',
          active && 'bg-[var(--bg-hover)] font-medium',
          over === 'into' && 'outline outline-2 outline-[var(--accent)]',
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        {over === 'before' && <div className="absolute inset-x-0 top-0 h-0.5 bg-[var(--accent)]" />}
        {over === 'after' && <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--accent)]" />}
        <button
          aria-label={open ? 'Replier' : 'Déplier'}
          onClick={() => toggleExpanded(page.id)}
          className={cn('rounded p-0.5 hover:bg-[var(--border)]', kids.length === 0 && 'invisible')}
        >
          <ChevronRight size={14} className={cn('transition-transform', open && 'rotate-90')} />
        </button>
        <button onClick={() => select(page.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {page.icon ? (
            <span className="w-4 shrink-0 text-center">{page.icon}</span>
          ) : (
            <FileText size={14} className="shrink-0 text-[var(--fg-muted)]" />
          )}
          <span className="truncate">{page.title || 'Sans titre'}</span>
        </button>
        <button
          title="Ajouter une sous-page"
          onClick={() => void createPage(page.id)}
          className="rounded p-0.5 opacity-0 hover:bg-[var(--border)] group-hover:opacity-100"
        >
          <Plus size={14} />
        </button>
      </div>
      {open && kids.map((k) => <TreeItem key={k.id} page={k} depth={depth + 1} drag={drag} setDrag={setDrag} />)}
    </div>
  )
}

export function Sidebar() {
  const { objects, view, show, select, selectedId, createPage, theme, toggleTheme } = useApp()
  const [drag, setDrag] = useState<DragState>({ dragId: null, over: null })
  const roots = childrenOf(objects, null)
  const favorites = objects.filter((o) => o.type === 'page' && !o.deleted_at && o.is_favorite)

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-side)] p-2">
      <div className="px-2 py-2 text-base font-semibold">Form</div>

      {favorites.length > 0 && (
        <>
          <Label>Favoris</Label>
          {favorites.map((p) => (
            <Item key={p.id} active={view === 'page' && selectedId === p.id} onClick={() => select(p.id)}>
              {p.icon ? <span className="w-4 text-center">{p.icon}</span> : <FileText size={14} className="text-[var(--fg-muted)]" />}
              <span className="truncate">{p.title || 'Sans titre'}</span>
            </Item>
          ))}
        </>
      )}

      <Label>Pages</Label>
      <div className="min-h-0 flex-1 overflow-y-auto" onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag({ ...drag, over: null }) }}>
        {roots.map((p) => <TreeItem key={p.id} page={p} depth={0} drag={drag} setDrag={setDrag} />)}
        {roots.length === 0 && <div className="px-2 text-sm text-[var(--fg-muted)]">Aucune page</div>}
      </div>
      <Item onClick={() => void createPage()}>
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
