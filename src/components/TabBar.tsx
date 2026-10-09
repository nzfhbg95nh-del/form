import { ChevronLeft, ChevronRight, PanelLeft, Plus, X } from 'lucide-react'
import { useApp } from '@/store/app'
import { Icon } from '@/components/Icon'

export function TabBar() {
  const { tabs, objects, view, activate, closeTabAt, setSearch, goBack, goForward, navBack, navForward, toggleSidebar } = useApp()

  return (
    <div className="flex items-end gap-0.5 overflow-x-auto border-b border-[var(--border)] bg-[var(--bg-side)] px-2 pt-1.5">
      <button title="Afficher / masquer la barre latérale (Ctrl+\)" onClick={toggleSidebar} className="mb-1 rounded-md p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"><PanelLeft size={16} strokeWidth={1.5} /></button>
      <button title="Précédent (Alt+←)" disabled={navBack.length === 0} onClick={goBack} className="mb-1 rounded-md p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] disabled:opacity-30"><ChevronLeft size={16} strokeWidth={1.5} /></button>
      <button title="Suivant (Alt+→)" disabled={navForward.length === 0} onClick={goForward} className="mb-1 rounded-md p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] mr-1 disabled:opacity-30"><ChevronRight size={16} strokeWidth={1.5} /></button>
      {tabs.ids.map((id, i) => {
        const o = objects.find((x) => x.id === id)
        const active = view === 'page' && i === tabs.active
        return (
          <div
            key={id + i}
            onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); closeTabAt(i) } }}
            className={'group flex max-w-[220px] items-center gap-1 rounded-t-lg px-3 py-1.5 text-sm ' + (active ? 'bg-[var(--bg)] font-medium' : 'text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]')}
          >
            <button onClick={() => activate(i)} className="flex min-w-0 items-center gap-2">
              <Icon value={o?.icon ?? (o?.type === 'database' ? '📊' : '📄')} size={16} />
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
      <button title="Nouvel onglet (Ctrl+T)" onClick={() => setSearch(true, true)} className="mb-1 ml-1 rounded-md p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]">
        <Plus size={16} strokeWidth={1.5} />
      </button>
    </div>
  )
}
