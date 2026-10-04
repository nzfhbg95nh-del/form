import { useState } from 'react'
import { AiSettings } from '@/components/AiSettings'
import { CgvSettings, CompanySettings } from '@/components/CompanySettings'
import { MailSettings } from '@/components/MailSettings'
import { NotionImport } from '@/components/NotionImport'
import { GeneralSettings } from '@/components/SettingsView'

const TABS = [
  { id: 'general', label: 'Général' },
  { id: 'company', label: 'Entreprise' },
  { id: 'cgv', label: 'CGV' },
  { id: 'ai', label: 'Assistant IA' },
  { id: 'mail', label: 'Courrier' },
  { id: 'notion', label: 'Import Notion' },
] as const

export function SettingsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('general')
  return (
    <div>
      <div className="flex gap-1 border-b border-[var(--border)] px-12 pt-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={'border-b-2 px-3 py-1.5 text-sm ' + (tab === t.id ? 'border-[var(--fg)] font-medium' : 'border-transparent text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'general' && <GeneralSettings />}
      {tab === 'company' && <CompanySettings />}
      {tab === 'cgv' && <CgvSettings />}
      {tab === 'ai' && <AiSettings />}
      {tab === 'mail' && <MailSettings />}
      {tab === 'notion' && <NotionImport />}
    </div>
  )
}
