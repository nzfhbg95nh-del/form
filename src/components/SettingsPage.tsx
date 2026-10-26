import { useState } from 'react'
import { AiSettings } from '@/components/AiSettings'
import { CgvSettings, CompanySettings } from '@/components/CompanySettings'
import { LibrarySettings } from '@/biblio/components/LibrarySettings'
import { NotionImport } from '@/components/NotionImport'
import { GeneralSettings } from '@/components/SettingsView'

const TABS = [
  { id: 'general', label: 'Général' },
  { id: 'company', label: 'Entreprise' },
  { id: 'cgv', label: 'CGV' },
  { id: 'ai', label: 'Assistant IA' },
  { id: 'notion', label: 'Import Notion' },
  { id: 'library', label: 'Bibliothèque' },
] as const

export function SettingsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('general')
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)] px-12 pt-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={'whitespace-nowrap border-b-2 px-3 py-1.5 text-sm ' + (tab === t.id ? 'border-[var(--fg)] font-medium' : 'border-transparent text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'general' && <GeneralSettings />}
      {tab === 'company' && <CompanySettings />}
      {tab === 'cgv' && <CgvSettings />}
      {tab === 'ai' && <AiSettings />}
      {tab === 'notion' && <NotionImport />}
      {tab === 'library' && <LibrarySettings />}
    </div>
  )
}
