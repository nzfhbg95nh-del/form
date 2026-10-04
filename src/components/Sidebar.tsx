import { useEffect, useRef, useState } from 'react'
import {
  Banknote, Briefcase, CheckSquare, FileSignature, LayoutDashboard, Receipt, ChevronRight, Clock, Database, FileText, MoreHorizontal, Moon, PenLine, Plus, Search, Settings, Sun, Trash2, Users,
} from 'lucide-react'
import { PageMenu } from '@/components/PageMenu'
import { childrenOf, type DropZone } from '@/lib/tree'
import { PAGE_TEMPLATES } from '@/lib/templates'
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

function PageIcon({ page }: { page: ObjectRow }) {
  if (page.icon) return <span className="w-4 shrink-0 text-center">{page.icon}</span>
  return page.type === 'database'
    ? <Database size={14} className="shrink-0 text-[var(--fg-muted)]" />
    : <FileText size={14} className="shrink-0 text-[var(--fg-muted)]" />
}

interface DragState {
  dragId: string | null
  over: { id: string; zone: DropZone } | null
}

type OpenMenu = (id: string, x: number, y: number) => void

/** Clic sur une page : normal = ouvrir ; Ctrl+clic = nouvel onglet ; Alt+clic = aperçu latéral. */
function useOpenHandlers(id: string) {
  const { select, openPeek } = useApp()
  return {
    onClick: (e: React.MouseEvent) => {
      if (e.altKey) openPeek(id)
      else if (e.ctrlKey || e.metaKey) select(id, { newTab: true })
      else select(id)
    },
    onAuxClick: (e: React.MouseEvent) => {
      if (e.button === 1) { e.preventDefault(); select(id, { newTab: true }) }
    },
  }
}

function RenameInput({ page }: { page: ObjectRow }) {
  const { update, setRenaming } = useApp()
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const done = (save: boolean) => {
    if (save && ref.current && ref.current.value !== page.title) void update(page.id, { title: ref.current.value })
    setRenaming(null)
  }
  return (
    <input
      ref={ref}
      defaultValue={page.title}
      placeholder="Sans titre"
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done(true)
        else if (e.key === 'Escape') done(false)
      }}
      className="min-w-0 flex-1 rounded border border-[var(--accent)] bg-[var(--bg)] px-1 text-sm outline-none"
    />
  )
}

function TreeItem({
  page, depth, drag, setDrag, openMenu,
}: {
  page: ObjectRow
  depth: number
  drag: DragState
  setDrag: (d: DragState) => void
  openMenu: OpenMenu
}) {
  const { objects, selectedId, view, expanded, toggleExpanded, createPage, move, renamingId } = useApp()
  const handlers = useOpenHandlers(page.id)
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
        draggable={renamingId !== page.id}
        onContextMenu={(e) => { e.preventDefault(); openMenu(page.id, e.clientX, e.clientY) }}
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
        {renamingId === page.id ? (
          <>
            <PageIcon page={page} />
            <RenameInput page={page} />
          </>
        ) : (
          <button {...handlers} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <PageIcon page={page} />
            <span className="truncate">{page.title || 'Sans titre'}</span>
          </button>
        )}
        <button
          title="Plus d'actions"
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openMenu(page.id, r.left, r.bottom + 4) }}
          className="rounded p-0.5 opacity-0 hover:bg-[var(--border)] group-hover:opacity-100"
        >
          <MoreHorizontal size={14} />
        </button>
        {page.type === 'page' && (
          <button
            title="Ajouter une sous-page"
            onClick={() => void createPage(page.id)}
            className="rounded p-0.5 opacity-0 hover:bg-[var(--border)] group-hover:opacity-100"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      {open && kids.map((k) => <TreeItem key={k.id} page={k} depth={depth + 1} drag={drag} setDrag={setDrag} openMenu={openMenu} />)}
    </div>
  )
}

function ShortcutItem({ page }: { page: ObjectRow }) {
  const { selectedId, view } = useApp()
  const handlers = useOpenHandlers(page.id)
  return (
    <button
      {...handlers}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-[var(--bg-hover)]',
        view === 'page' && selectedId === page.id && 'bg-[var(--bg-hover)] font-medium',
      )}
    >
      <PageIcon page={page} />
      <span className="truncate">{page.title || 'Sans titre'}</span>
    </button>
  )
}

export function Sidebar() {
  const {
    objects, view, show, createPage, createDatabase, createTasks, createFromTemplate, setSearch, setCapture, theme, toggleTheme,
  } = useApp()
  const [newMenu, setNewMenu] = useState(false)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<DragState>({ dragId: null, over: null })
  const live = objects.filter((o) => !o.deleted_at && (o.type === 'page' || o.type === 'database'))
  const roots = childrenOf(objects, null)
  const favorites = live.filter((o) => o.is_favorite)
  const recents = [...live].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5)
  const openMenu: OpenMenu = (id, x, y) => setMenu({ id, x, y })

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-side)] p-2">
      <div className="px-2 py-2 text-base font-semibold">Form</div>
      <Item onClick={() => setSearch(true)}>
        <Search size={14} /> Rechercher
        <span className="ml-auto text-xs text-[var(--fg-muted)]">Ctrl+K</span>
      </Item>
      <Item onClick={() => setCapture(true)}>
        <PenLine size={14} /> Capture rapide
      </Item>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Label>Mon entreprise</Label>
        <Item active={view === 'dashboard'} onClick={() => show('dashboard')}>
          <LayoutDashboard size={14} /> Tableau de bord
        </Item>
        <Item active={view === 'clients'} onClick={() => show('clients')}>
          <Users size={14} /> Clients
        </Item>
        <Item active={view === 'services'} onClick={() => show('services')}>
          <Briefcase size={14} /> Prestations
        </Item>
        <Item active={view === 'quotes'} onClick={() => show('quotes')}>
          <FileSignature size={14} /> Devis
        </Item>
        <Item active={view === 'invoices'} onClick={() => show('invoices')}>
          <Receipt size={14} /> Factures
        </Item>
        <Item active={view === 'payments'} onClick={() => show('payments')}>
          <Banknote size={14} /> Paiements
        </Item>

        {favorites.length > 0 && (
          <>
            <Label>Favoris</Label>
            {favorites.map((p) => <ShortcutItem key={p.id} page={p} />)}
          </>
        )}

        {recents.length > 0 && (
          <>
            <Label><span className="inline-flex items-center gap-1"><Clock size={11} /> Récentes</span></Label>
            {recents.map((p) => <ShortcutItem key={p.id} page={p} />)}
          </>
        )}

        <Label>Pages</Label>
        <div onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag({ ...drag, over: null }) }}>
          {roots.map((p) => <TreeItem key={p.id} page={p} depth={0} drag={drag} setDrag={setDrag} openMenu={openMenu} />)}
          {roots.length === 0 && <div className="px-2 text-sm text-[var(--fg-muted)]">Aucune page</div>}
        </div>
      </div>

      <div className="relative">
        <Item onClick={() => setNewMenu(!newMenu)}>
          <Plus size={14} /> Nouveau…
        </Item>
        {newMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setNewMenu(false)} />
            <div className="absolute bottom-full left-0 z-20 mb-1 w-56 rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 shadow-lg">
              <Item onClick={() => { setNewMenu(false); void createPage() }}><FileText size={14} /> Page vide</Item>
              {PAGE_TEMPLATES.map((t) => (
                <Item key={t.id} onClick={() => { setNewMenu(false); void createFromTemplate(t.id) }}>
                  <span className="w-3.5 text-center">{t.icon}</span> {t.label}
                </Item>
              ))}
              <div className="my-1 border-t border-[var(--border)]" />
              <Item onClick={() => { setNewMenu(false); void createDatabase() }}><Database size={14} /> Base de données vide</Item>
              <Item onClick={() => { setNewMenu(false); void createTasks() }}><CheckSquare size={14} /> Base de tâches</Item>
            </div>
          </>
        )}
      </div>

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

      {menu && <PageMenu id={menu.id} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </aside>
  )
}
