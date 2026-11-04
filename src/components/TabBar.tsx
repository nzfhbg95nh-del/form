import { useState } from 'react'
import { PageMenu } from '@/components/PageMenu'
import { Banknote, Briefcase, ChevronLeft, ChevronRight, Copy, CopyPlus, FileSignature, FolderOpen, Home, Images, LayoutDashboard, LayoutGrid, Map as MapIcon, PanelLeft, Pin, PinOff, Plus, Receipt, RotateCcw, Settings, Trash2, Users, X } from 'lucide-react'
import { useApp } from '@/store/app'
import { Icon } from '@/components/Icon'
import { useLibraryNav } from '@/biblio/store/nav.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { viewTitle } from '@/lib/viewTitle'
import { closeAround, parseViewTab } from '@/lib/tabs'
import { pageLink } from '@/lib/windowActions'

const VIEW_ICONS: Record<string, React.ReactNode> = {
  home: <Home size={14} />, trash: <Trash2 size={14} />, settings: <Settings size={14} />, clients: <Users size={14} />, services: <Briefcase size={14} />,
  quotes: <FileSignature size={14} />, invoices: <Receipt size={14} />, payments: <Banknote size={14} />, dashboard: <LayoutDashboard size={14} />,
}
const LIBRARY_ICONS: Record<string, React.ReactNode> = { all: <LayoutGrid size={14} />, collections: <FolderOpen size={14} />, moodboards: <Images size={14} />, map: <MapIcon size={14} /> }

export function TabBar() {
  const { tabs, objects, view, activate, closeTabAt, setSearch, goBack, goForward, navBack, navForward, toggleSidebar, pinnedTabs } = useApp()
  const libPage = useLibraryNav((s) => s.page)
  const openedCollection = useGrid((s) => s.filters.collection)
  // Clic droit sur un onglet : le menu de la page (favori, épingler, renommer, supprimer…), ou juste « Fermer » pour un écran.
  const [menu, setMenu] = useState<{ i: number; x: number; y: number; page?: boolean } | null>(null)
  const menuId = menu ? tabs.ids[menu.i] : undefined

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-[var(--border)] bg-[var(--bg-side)] px-1 pt-1">
      <button title="Afficher / masquer la barre latérale (Ctrl+\)" onClick={toggleSidebar} className="mb-0.5 rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"><PanelLeft size={16} /></button>
      <button title="Précédent (Alt+←)" disabled={navBack.length === 0} onClick={goBack} className="mb-0.5 rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] disabled:opacity-30"><ChevronLeft size={16} /></button>
      <button title="Suivant (Alt+→)" disabled={navForward.length === 0} onClick={goForward} className="mb-0.5 mr-1 rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] disabled:opacity-30"><ChevronRight size={16} /></button>
      {tabs.ids.map((id, i) => {
        const o = objects.find((x) => x.id === id)
        const vt = parseViewTab(id)
        const active = vt ? view !== 'page' && i === tabs.active : view === 'page' && i === tabs.active
        const pinned = pinnedTabs.includes(id)
        const title = vt ? viewTitle(vt.view as never, (vt.libPage ?? 'all') as never, null) : o?.title || 'Nouvelle page'
        return (
          <div
            key={id + i}
            onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); if (!pinned) closeTabAt(i) } }}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ i, x: e.clientX, y: e.clientY }) }}
            className={'group flex max-w-[200px] items-center gap-1 rounded-t-md px-2 py-1 text-sm ' + (active ? 'bg-[var(--bg)] font-medium' : 'text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]')}
          >
            <button onClick={() => activate(i)} title={pinned ? title : undefined} className="flex min-w-0 items-center gap-1.5">
              {vt ? (vt.libPage ? LIBRARY_ICONS[vt.libPage] : VIEW_ICONS[vt.view]) : <Icon value={o?.icon ?? (o?.type === 'database' ? '📊' : '📄')} size={15} />}
              {!pinned && <span className="truncate">{title}</span>}
            </button>
            {pinned ? <Pin size={10} className="shrink-0 text-[var(--fg-muted)]" aria-label="Onglet épinglé" /> : (
              <button
                title="Fermer l'onglet"
                onClick={() => closeTabAt(i)}
                className="rounded p-0.5 opacity-0 hover:bg-[var(--border)] group-hover:opacity-100"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )
      })}
      {/* Hors d'une page (Accueil, Devis, Tout…), l'onglet actif porte le nom de l'écran : on sait toujours où l'on est. */}
      {view !== 'page' && !parseViewTab(tabs.ids[tabs.active] ?? '') && (
        <div className="flex max-w-[200px] items-center gap-1.5 rounded-t-md bg-[var(--bg)] px-2 py-1 text-sm font-medium" aria-current="page">
          {view === 'library' ? LIBRARY_ICONS[libPage] ?? <LayoutGrid size={14} /> : VIEW_ICONS[view]}
          <span className="truncate">{viewTitle(view, libPage, openedCollection?.name ?? null)}</span>
        </div>
      )}
      {menu && menuId && !menu.page && <TabMenu index={menu.i} id={menuId} x={menu.x} y={menu.y} onClose={() => setMenu(null)} onPageOptions={() => setMenu({ ...menu, page: true })} />}
      {menu && menuId && menu.page && <PageMenu id={menuId} x={menu.x} y={menu.y} onClose={() => setMenu(null)} closeTab={tabs.ids.length > 1 ? () => closeTabAt(menu.i) : undefined} />}
      <button title="Nouvel onglet (Ctrl+T)" onClick={() => setSearch(true, true)} className="mb-0.5 ml-1 rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]">
        <Plus size={14} />
      </button>
    </div>
  )
}

/** Clic droit sur un onglet, comme dans Notion : copier le lien, dupliquer, épingler, rouvrir, et les différentes façons de fermer. */
function TabMenu({ index, id, x, y, onClose, onPageOptions }: { index: number; id: string; x: number; y: number; onClose: () => void; onPageOptions: () => void }) {
  const { tabs, closedTabs, pinnedTabs, closeTabAt, duplicateTabAt, togglePinTab, closeTabsAround, reopenTab } = useApp()
  const isView = !!parseViewTab(id)
  const pinned = pinnedTabs.includes(id)
  const can = (side: 'others' | 'left' | 'right') => closeAround(tabs, index, side, pinnedTabs).closed.length > 0
  const item = (icon: React.ReactNode, label: string, action: () => void, enabled = true) => (
    <button
      disabled={!enabled}
      onClick={() => { onClose(); action() }}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {icon}
      <span className="flex-1">{label}</span>
    </button>
  )
  const sep = <div className="my-1 border-t border-[var(--border)]" />
  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div role="menu" className="fixed z-50 w-64 rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 shadow-xl" style={{ left: Math.min(x, window.innerWidth - 270), top: Math.min(y, window.innerHeight - 400) }}>
        {!isView && item(<Copy size={14} />, 'Copier le lien', () => void navigator.clipboard.writeText(pageLink(id)))}
        {item(<CopyPlus size={14} />, "Dupliquer l'onglet", () => duplicateTabAt(index))}
        {item(pinned ? <PinOff size={14} /> : <Pin size={14} />, pinned ? 'Désépingler cet onglet' : 'Épingler cet onglet', () => togglePinTab(index))}
        {!isView && item(<PanelLeft size={14} />, 'Options de la page…', onPageOptions)}
        {sep}
        {item(<RotateCcw size={14} />, 'Rouvrir le dernier onglet fermé', reopenTab, closedTabs.length > 0)}
        {sep}
        {item(<X size={14} />, "Fermer l'onglet", () => closeTabAt(index), tabs.ids.length > 1 || isView)}
        {item(<X size={14} />, 'Fermer les autres onglets', () => closeTabsAround(index, 'others'), can('others'))}
        {item(<X size={14} />, 'Fermer les onglets à gauche', () => closeTabsAround(index, 'left'), can('left'))}
        {item(<X size={14} />, 'Fermer les onglets à droite', () => closeTabsAround(index, 'right'), can('right'))}
      </div>
    </>
  )
}