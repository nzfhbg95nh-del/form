import { useState } from 'react'
import { Building2, Download, Images, Palette, SlidersHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CompanySettings } from '@/components/CompanySettings'
import { InterfaceSettings } from '@/components/InterfaceSettings'
import { LibrarySettings } from '@/biblio/components/LibrarySettings'
import { NotionImport } from '@/components/NotionImport'
import { GeneralSettings } from '@/components/SettingsView'

type Id = 'general' | 'interface' | 'library' | 'company' | 'notion'

/** Les pages de réglages. */
const PAGES: { id: Id; label: string; icon: LucideIcon }[] = [
  { id: 'general', label: 'Général', icon: SlidersHorizontal },
  { id: 'interface', label: 'Interface', icon: Palette },
  { id: 'library', label: 'Bibliothèque', icon: Images },
  { id: 'company', label: 'Mon entreprise', icon: Building2 },
  { id: 'notion', label: 'Import Notion', icon: Download },
]

export function SettingsPage() {
  const [page, setPage] = useState<Id>('general')
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
        {page === 'company' && <CompanySettings />}
        {page === 'notion' && <NotionImport />}
      </div>
    </div>
  )
}
