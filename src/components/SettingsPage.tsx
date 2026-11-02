import { useState } from 'react'
import { Building2, Download, FileText, Images, SlidersHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CgvSettings, CompanySettings } from '@/components/CompanySettings'
import { LibrarySettings } from '@/biblio/components/LibrarySettings'
import { NotionImport } from '@/components/NotionImport'
import { GeneralSettings } from '@/components/SettingsView'

type Id = 'general' | 'library' | 'company' | 'cgv' | 'notion'

/** Les pages de réglages, rangées par thème. */
const GROUPS: { label: string; items: { id: Id; label: string; icon: LucideIcon }[] }[] = [
  { label: 'Application', items: [{ id: 'general', label: 'Général', icon: SlidersHorizontal }] },
  { label: 'Mes images', items: [{ id: 'library', label: 'Bibliothèque', icon: Images }] },
  {
    label: 'Mon entreprise',
    items: [
      { id: 'company', label: 'Entreprise', icon: Building2 },
      { id: 'cgv', label: 'Conditions de vente', icon: FileText },
    ],
  },
  { label: 'Importer', items: [{ id: 'notion', label: 'Import Notion', icon: Download }] },
]

export function SettingsPage() {
  const [page, setPage] = useState<Id>('general')
  return (
    <div className="flex min-h-full">
      <nav aria-label="Réglages" className="sticky top-0 h-screen w-56 shrink-0 self-start overflow-y-auto border-r border-[var(--border)] p-4">
        <h2 className="mb-3 px-2 text-sm font-semibold text-[var(--fg-muted)]">Réglages</h2>
        {GROUPS.map((g) => (
          <div key={g.label} className="mb-4">
            <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--fg-muted)]">{g.label}</div>
            {g.items.map((it) => (
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
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {page === 'general' && <GeneralSettings />}
        {page === 'library' && <LibrarySettings />}
        {page === 'company' && <CompanySettings />}
        {page === 'cgv' && <CgvSettings />}
        {page === 'notion' && <NotionImport />}
      </div>
    </div>
  )
}
