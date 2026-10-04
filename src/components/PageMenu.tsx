import { Copy, ExternalLink, FolderInput, PanelRight, PenLine, Star, Trash2 } from 'lucide-react'
import { useApp } from '@/store/app'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Menu « ⋯ » d'une page (clic sur ⋯ ou clic droit dans la barre latérale). */
export function PageMenu({ id, x, y, onClose }: { id: string; x: number; y: number; onClose: () => void }) {
  const { objects, update, select, openPeek, setRenaming, setMoving, duplicate, trash } = useApp()
  const page = objects.find((o) => o.id === id)
  if (!page) return null

  const item = (icon: React.ReactNode, label: string, action: () => void, hint?: string, danger = false) => (
    <button
      onClick={() => { onClose(); action() }}
      className={'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)] ' + (danger ? 'text-red-500' : '')}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {hint && <span className="text-xs text-[var(--fg-muted)]">{hint}</span>}
    </button>
  )

  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        className="fixed z-50 w-64 rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 shadow-xl"
        style={{ left: Math.min(x, window.innerWidth - 270), top: Math.min(y, window.innerHeight - 340) }}
      >
        {item(<Star size={14} />, page.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris', () => void update(id, { is_favorite: page.is_favorite ? 0 : 1 }))}
        <div className="my-1 border-t border-[var(--border)]" />
        {item(<PenLine size={14} />, 'Renommer', () => setRenaming(id), 'Ctrl+Maj+R')}
        {item(<Copy size={14} />, 'Dupliquer', () => void duplicate(id), 'Ctrl+D')}
        {item(<FolderInput size={14} />, 'Déplacer vers…', () => setMoving(id))}
        {item(<Trash2 size={14} />, 'Déplacer dans la corbeille', () => void trash(id), undefined, true)}
        <div className="my-1 border-t border-[var(--border)]" />
        {item(<ExternalLink size={14} />, 'Nouvel onglet', () => select(id, { newTab: true }))}
        {item(<PanelRight size={14} />, 'Ouvrir en aperçu latéral', () => openPeek(id), 'Alt+clic')}
        <div className="my-1 border-t border-[var(--border)]" />
        <div className="px-2 py-1 text-xs text-[var(--fg-muted)]">Dernière modification : {formatDate(page.updated_at)}</div>
      </div>
    </>
  )
}
