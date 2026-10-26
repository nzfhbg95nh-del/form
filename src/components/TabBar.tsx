import { Banknote, Briefcase, ChevronLeft, ChevronRight, FileSignature, FolderOpen, Home, Images, LayoutDashboard, LayoutGrid, Map as MapIcon, PanelLeft, Plus, Receipt, Settings, Trash2, Users, X } from 'lucide-react'
import { useApp } from '@/store/app'
import { Icon } from '@/components/Icon'
import { useLibraryNav } from '@/biblio/store/nav.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { viewTitle } from '@/lib/viewTitle'

const VIEW_ICONS: Record<string, React.ReactNode> = {
  home: <Home size={15} />, trash: <Trash2 size={15} />, settings: <Settings size={15} />, clients: <Users size={15} />, services: <Briefcase size={15} />,
  quotes: <FileSignature size={15} />, invoices: <Receipt size={15} />, payments: <Banknote size={15} />, dashboard: <LayoutDashboard size={15} />,
}
const LIBRARY_ICONS: Record<string, React.ReactNode> = { all: <LayoutGrid size={15} />, collections: <FolderOpen size={15} />, moodboards: <Images size={15} />, map: <MapIcon size={15} /> }

export function TabBar() {
  const { tabs, objects, view, activate, closeTabAt, setSearch, goBack, goForward, navBack, navForward, toggleSidebar } = useApp()
  const libPage = useLibraryNav((s) => s.page)
  const openedCollection = useGrid((s) => s.filters.collection)

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-[var(--border)] bg-[var(--bg-side)] px-1 pt-1">
      <button title="Afficher / masquer la barre latérale (Ctrl+\)" onClick={toggleSidebar} className="mb-0.5 rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"><PanelLeft size={16} /></button>
      <button title="Précédent (Alt+←)" disabled={navBack.length === 0} onClick={goBack} className="mb-0.5 rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] disabled:opacity-30"><ChevronLeft size={16} /></button>
      <button title="Suivant (Alt+→)" disabled={navForward.length === 0} onClick={goForward} className="mb-0.5 mr-1 rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] disabled:opacity-30"><ChevronRight size={16} /></button>
      {tabs.ids.map((id, i) => {
        const o = objects.find((x) => x.id === id)
        const active = view === 'page' && i === tabs.active
        return (
          <div
            key={id + i}
            onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); closeTabAt(i) } }}
            className={'group flex max-w-[200px] items-center gap-1 rounded-t-md px-2 py-1 text-sm ' + (active ? 'bg-[var(--bg)] font-medium' : 'text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]')}
          >
            <button onClick={() => activate(i)} className="flex min-w-0 items-center gap-1.5">
              <Icon value={o?.icon ?? (o?.type === 'database' ? '📊' : '📄')} size={15} />
              <span className="truncate">{o?.title || 'Nouvelle page'}</span>
            </button>
            <button
              title="Fermer l'onglet"
              onClick={() => closeTabAt(i)}
              className="rounded p-0.5 opacity-0 hover:bg-[var(--border)] group-hover:opacity-100"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
      {/* Hors d'une page (Accueil, Devis, Tout…), l'onglet actif porte le nom de l'écran : on sait toujours où l'on est. */}
      {view !== 'page' && (
        <div className="flex max-w-[200px] items-center gap-1.5 rounded-t-md bg-[var(--bg)] px-2 py-1 text-sm font-medium" aria-current="page">
          {view === 'library' ? LIBRARY_ICONS[libPage] ?? <LayoutGrid size={15} /> : VIEW_ICONS[view]}
          <span className="truncate">{viewTitle(view, libPage, openedCollection?.name ?? null)}</span>
        </div>
      )}
      <button title="Nouvel onglet (Ctrl+T)" onClick={() => setSearch(true, true)} className="mb-0.5 ml-1 rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]">
        <Plus size={14} />
      </button>
    </div>
  )
}
