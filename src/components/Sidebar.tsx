import { useEffect, useRef, useState } from 'react'
import {
  Banknote, Briefcase, CheckSquare, ChefHat, SquarePen, Mail, FileSignature, Images, LayoutDashboard, Receipt, ChevronRight, Clock, Database, FileText, MoreHorizontal, Moon, PenLine, Pin, Plus, Search, Settings, Sun, Trash2, Users, Home,
} from 'lucide-react'
import { AppMenu } from '@/components/AppMenu'
import { PageMenu } from '@/components/PageMenu'
import { isSystemDatabase, parseSchema } from '@/lib/database'
import { pinnedPages } from '@/lib/pinned'
import { childrenOf, type DropZone } from '@/lib/tree'
import { PAGE_TEMPLATES } from '@/lib/templates'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import type { ObjectRow } from '@/lib/types'
import { Icon } from '@/components/Icon'

/** Bouton rond de la rangée du haut : seule la bulle active déplie son nom. */
function Bubble({ label, hint, active, onClick, children }: { label: string; hint?: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={hint ? `${label} (${hint})` : label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-9 shrink-0 items-center justify-center gap-2 rounded-full text-sm hover:bg-[var(--bg-hover)] [&>svg]:stroke-[1.6]',
        active ? 'bg-[var(--bg-hover)] px-3.5 font-semibold' : 'w-9 text-[var(--fg-muted)] hover:text-[var(--fg)]',
      )}
    >
      {children}
      {active && label}
    </button>
  )
}

function Item({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)] [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:stroke-[1.5] [&>svg]:text-[var(--fg-muted)]',
        active && 'bg-[var(--bg-hover)] font-medium',
      )}
    >
      {children}
    </button>
  )
}

/** Titre de section qu'on peut replier d'un clic (état gardé d'une fois sur l'autre). */
function CollapsibleLabel({ id, collapsed, toggle, children }: { id: string; collapsed: boolean; toggle: (id: string) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      onClick={() => toggle(id)}
      className="group flex w-full items-center gap-1 px-2 pb-1 pt-4 text-left text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]"
    >
      {children}
      {/* La flèche suit le texte et n'apparaît qu'au survol. */}
      <ChevronRight size={11} className={'shrink-0 opacity-0 transition-all group-hover:opacity-100 ' + (collapsed ? '' : 'rotate-90')} />
    </button>
  )
}

function PageIcon({ page }: { page: ObjectRow }) {
  if (page.icon) return <Icon value={page.icon} size={16} />
  if (page.type === 'moodboard') return <Images size={16} strokeWidth={1.5} className="shrink-0 text-[var(--fg-muted)]" />
  return page.type === 'database'
    ? <Database size={16} strokeWidth={1.5} className="shrink-0 text-[var(--fg-muted)]" />
    : <FileText size={16} strokeWidth={1.5} className="shrink-0 text-[var(--fg-muted)]" />
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
      placeholder="Nouvelle page"
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
  const { objects, selectedId, view, expanded, toggleExpanded, createPage, move, renamingId, pinned } = useApp()
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
          'group relative flex items-center gap-1 rounded-md py-1 pr-1 text-sm hover:bg-[var(--bg-hover)]',
          active && 'bg-[var(--bg-hover)] font-medium',
          over === 'into' && 'outline outline-2 outline-[var(--accent)]',
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        {over === 'before' && <div className="absolute inset-x-0 top-0 h-0.5 bg-[var(--accent)]" />}
        {over === 'after' && <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--accent)]" />}
        {pinned.includes(page.id) && <Pin size={11} aria-label="Épinglée" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rotate-45 text-[var(--fg-muted)] transition-opacity group-hover:opacity-0" />}
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
          <button {...handlers} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <PageIcon page={page} />
            <span className="truncate">{page.title || 'Nouvelle page'}</span>
          </button>
        )}
        {page.type === 'page' && (
          <button
            title="Ajouter une sous-page"
            onClick={() => void createPage(page.id)}
            className="rounded p-0.5 opacity-0 hover:bg-[var(--border)] group-hover:opacity-100"
          >
            <Plus size={14} />
          </button>
        )}
        <button
          title="Plus d'actions"
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openMenu(page.id, r.left, r.bottom + 4) }}
          className="rounded p-0.5 opacity-0 hover:bg-[var(--border)] group-hover:opacity-100"
        >
          <MoreHorizontal size={14} />
        </button>
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
        'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)]',
        view === 'page' && selectedId === page.id && 'bg-[var(--bg-hover)] font-medium',
      )}
    >
      <PageIcon page={page} />
      <span className="truncate">{page.title || 'Nouvelle page'}</span>
    </button>
  )
}

export function Sidebar() {
  const {
    objects, view, show, createPage, createDatabase, createTasks, createMoodboard, createFromTemplate, setSearch, setCapture, openMail, openRecipes, selectedId, theme, toggleTheme, pinned,
  } = useApp()
  const [newMenu, setNewMenu] = useState(false)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<DragState>({ dragId: null, over: null })
  const live = objects.filter((o) => !o.deleted_at && (o.type === 'page' || o.type === 'database' || o.type === 'moodboard') && !isSystemDatabase(o))
  const roots = childrenOf(objects, null)
  const recipesDb = objects.find((o) => o.type === 'database' && !o.deleted_at && parseSchema(o.properties).kind === 'recipes')
  const favorites = live.filter((o) => o.is_favorite)
  const pinnedList = pinnedPages(pinned, live)
  const recents = [...live].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5)
  const openMenu: OpenMenu = (id, x, y) => setMenu({ id, x, y })
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('form-sidebar-collapsed') ?? '{}') } catch { return {} }
  })
  const toggleSection = (id: string) => {
    const next = { ...collapsed, [id]: !collapsed[id] }
    setCollapsed(next)
    try { localStorage.setItem('form-sidebar-collapsed', JSON.stringify(next)) } catch { /* sans importance */ }
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-side)] px-2 py-2">
      <AppMenu />
      {/* Comme dans Notion : une rangée de « bulles » ; celle de la page ouverte s'élargit et montre son nom. */}
      <div className="mb-1 flex items-center gap-0.5">
        <Bubble label="Accueil" active={view === 'home'} onClick={() => show('home')}><Home size={18} /></Bubble>
                <Bubble label="Note rapide" onClick={() => setCapture(true)}><PenLine size={18} /></Bubble>
        <Bubble label="Recettes" active={view === 'page' && !!recipesDb && selectedId === recipesDb.id} onClick={() => void openRecipes()}><ChefHat size={18} /></Bubble>
        <span className="ml-auto" />
        <Bubble label="Rechercher" hint="Ctrl+K" onClick={() => setSearch(true)}><Search size={18} /></Bubble>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <CollapsibleLabel id="company" collapsed={!!collapsed.company} toggle={toggleSection}>Mon entreprise</CollapsibleLabel>
        {!collapsed.company && (
          <>
        <Item active={view === 'dashboard'} onClick={() => show('dashboard')}>
          <LayoutDashboard size={14} /> Tableau de bord
        </Item>
        <Item active={view === 'clients'} onClick={() => show('clients')}>
          <Users size={14} /> Clients
        </Item>
        <Item active={view === 'services'} onClick={() => show('services')}>
          <Briefcase size={14} /> Tarifs
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
        <Item active={view === 'mail'} onClick={() => void openMail()}>
          <Mail size={14} /> Courrier
        </Item>
          </>
        )}

        {favorites.length > 0 && (
          <>
            <CollapsibleLabel id="favorites" collapsed={!!collapsed.favorites} toggle={toggleSection}>Favoris</CollapsibleLabel>
            {!collapsed.favorites && favorites.map((p) => <ShortcutItem key={p.id} page={p} />)}
          </>
        )}

        {recents.length > 0 && (
          <>
            <CollapsibleLabel id="recents" collapsed={!!collapsed.recents} toggle={toggleSection}><span className="inline-flex items-center gap-1"><Clock size={11} /> Récentes</span></CollapsibleLabel>
            {!collapsed.recents && recents.map((p) => <ShortcutItem key={p.id} page={p} />)}
          </>
        )}

        <CollapsibleLabel id="pages" collapsed={!!collapsed.pages} toggle={toggleSection}>Pages</CollapsibleLabel>
        {/* Les pages épinglées restent tout en haut de la liste, avec une petite punaise. */}
        <div hidden={!!collapsed.pages} onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag({ ...drag, over: null }) }}>
          {pinnedList.map((p) => <TreeItem key={'pin-' + p.id} page={p} depth={0} drag={drag} setDrag={setDrag} openMenu={openMenu} />)}
          {roots.filter((p) => !pinned.includes(p.id)).map((p) => <TreeItem key={p.id} page={p} depth={0} drag={drag} setDrag={setDrag} openMenu={openMenu} />)}
          <button onClick={() => void createPage()} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]">
            <Plus size={16} strokeWidth={1.5} className="shrink-0" /> Ajouter
          </button>
        </div>
        <div className="mt-4">
          <Item active={view === 'trash'} onClick={() => show('trash')}>
            <Trash2 size={16} /> Corbeille
          </Item>
          <Item active={view === 'settings'} onClick={() => show('settings')}>
            <Settings size={16} /> Réglages
          </Item>
          <Item onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
          </Item>
        </div>
      </div>

      <div className="relative pt-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => void createPage()}
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-4 text-sm font-medium shadow-sm hover:bg-[var(--bg-hover)]"
          >
            <Plus size={16} strokeWidth={1.8} /> <span className="truncate">Nouvelle page</span>
          </button>
          <button
            title="Autres types : base de données, moodboard, modèles…"
            aria-label="Autres types de pages"
            onClick={() => setNewMenu(!newMenu)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg)] text-[var(--fg-muted)] shadow-sm hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]"
          >
            <SquarePen size={16} strokeWidth={1.5} />
          </button>
        </div>
        {newMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setNewMenu(false)} />
            <div className="absolute bottom-full left-0 z-20 mb-1 w-60 rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 shadow-lg">
              <Item onClick={() => { setNewMenu(false); void createMoodboard() }}><Images size={14} /> Moodboard</Item>
              <Item onClick={() => { setNewMenu(false); void createDatabase() }}><Database size={14} /> Base de données</Item>
              <Item onClick={() => { setNewMenu(false); void createTasks() }}><CheckSquare size={14} /> Base de tâches</Item>
              <div className="my-1 border-t border-[var(--border)]" />
              <div className="px-2 pb-0.5 pt-1 text-[11px] font-semibold uppercase text-[var(--fg-muted)]">Modèles (facultatif)</div>
              {PAGE_TEMPLATES.map((t) => (
                <Item key={t.id} onClick={() => { setNewMenu(false); void createFromTemplate(t.id) }}>
                  <Icon value={t.icon} size={14} /> {t.label}
                </Item>
              ))}
            </div>
          </>
        )}
      </div>

      {menu && <PageMenu id={menu.id} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </aside>
  )
}
