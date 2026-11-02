import { useEffect, useState } from 'react'
import { Building2, Download, Images, Palette, SlidersHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CompanySettings } from '@/components/CompanySettings'
import { InterfaceSettings } from '@/components/InterfaceSettings'
import { LibrarySettings } from '@/biblio/components/LibrarySettings'
import { NotionImport } from '@/components/NotionImport'
import { GeneralSettings } from '@/components/SettingsView'
import { useApp, type CompanyPanelId, type SettingsPageId } from '@/store/app'

type Id = SettingsPageId

/** Les pages de réglages. */
const PAGES: { id: Id; label: string; icon: LucideIcon }[] = [
  { id: 'general', label: 'Général', icon: SlidersHorizontal },
  { id: 'interface', label: 'Interface', icon: Palette },
  { id: 'library', label: 'Bibliothèque', icon: Images },
  { id: 'company', label: 'Mon entreprise', icon: Building2 },
  { id: 'notion', label: 'Import Notion', icon: Download },
]

export function SettingsPage() {
  const target = useApp((s) => s.settingsTarget)
  const clearTarget = useApp((s) => s.clearSettingsTarget)
  const [page, setPage] = useState<Id>(target?.page ?? 'general')
  // Un lien venu d'ailleurs (« Ouvrir les réglages » sur le tableau de bord…) ouvre la bonne page et le bon onglet de « Mon entreprise ».
  const [panel, setPanel] = useState<CompanyPanelId | undefined>(target?.panel)
  useEffect(() => {
    if (!target) return
    setPage(target.page)
    setPanel(target.panel)
    clearTarget()
  }, [target, clearTarget])
  return (
    <div className="flex min-h-full">
      <nav aria-label="Réglages" className="sticky top-0 h-screen w-56 shrink-0 self-start overflow-y-auto border-r border-[var(--border)] p-4">
        <h2 className="mb-3 px-2 text-sm font-semibold text-[var(--fg-muted)]">Réglages</h2>
        {PAGES.map((it) => (
          <button
            key={it.id}
            onClick={() => setPage(it.id)}
            aria-current={page === it.id ? 'page' : undefined}
            className={'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ' + (page === it.id ? 'bg-[var(--bg-hover)] font-medium' : 'text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]')}
          >
            <it.icon size={16} />
            {it.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {page === 'general' && <GeneralSettings />}
        {page === 'interface' && <InterfaceSettings />}
        {page === 'library' && <LibrarySettings />}
        {page === 'company' && <CompanySettings key={panel ?? 'identity'} initialPanel={panel} />}
        {page === 'notion' && <NotionImport />}
      </div>
    </div>
  )
}
