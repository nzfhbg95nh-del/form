import { ChevronLeft, ChevronRight, PanelLeft, Pin, Plus, X } from 'lucide-react'
import { useApp } from '@/store/app'
import { Icon } from '@/components/Icon'
import { displayTitle } from '@/lib/lastEdit'
import { pinnedPages } from '@/lib/pinned'

export function TabBar() {
  const { tabs, objects, view, activate, closeTabAt, setSearch, goBack, goForward, navBack, navForward, toggleSidebar, pinned, select, selectedId } = useApp()
  const pinnedList = pinnedPages(pinned, objects)

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-[var(--border)] bg-[var(--bg-side)] px-1 pt-1">
      <button title="Afficher / masquer la barre latérale (Ctrl+\)" onClick={toggleSidebar} className="mb-0.5 rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"><PanelLeft size={16} /></button>
      <button title="Précédent (Alt+←)" disabled={navBack.length === 0} onClick={goBack} className="mb-0.5 rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] disabled:opacity-30"><ChevronLeft size={16} /></button>
      <button title="Suivant (Alt+→)" disabled={navForward.length === 0} onClick={goForward} className="mb-0.5 mr-1 rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] disabled:opacity-30"><ChevronRight size={16} /></button>
      {pinnedList.map((o) => {
        const active = view === 'page' && selectedId === o.id
        return (
          <button
            key={o.id}
            title={`${displayTitle(o.title)} (épinglée)`}
            aria-label={`${displayTitle(o.title)} (onglet épinglé)`}
            aria-pressed={active}
            onClick={() => select(o.id)}
            className={'mb-0 flex h-[30px] w-10 shrink-0 items-center justify-center rounded-t-md ' + (active ? 'bg-[var(--bg)]' : 'text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]')}
          >
            <span className="relative">
              <Icon value={o.icon ?? (o.type === 'database' ? '📊' : o.type === 'moodboard' ? '🖼️' : '📄')} size={16} />
              <Pin size={9} aria-hidden className="absolute -bottom-1.5 -right-2 rotate-45 fill-[var(--accent)] text-[var(--accent)]" />
            </span>
          </button>
        )
      })}
      {pinnedList.length > 0 && <span className="mx-1 h-4 w-px shrink-0 bg-[var(--border)]" aria-hidden />}
      {tabs.ids.map((id, i) => {
        const o = objects.find((x) => x.id === id)
        const active = view === 'page' && i === tabs.active && !pinned.includes(selectedId ?? '')
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
      <button title="Nouvel onglet (Ctrl+T)" onClick={() => setSearch(true, true)} className="mb-0.5 ml-1 rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]">
        <Plus size={14} />
      </button>
    </div>
  )
}
