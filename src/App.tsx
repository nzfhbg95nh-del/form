import { useEffect } from 'react'
import { PageView } from '@/components/PageView'
import { SettingsView } from '@/components/SettingsView'
import { Sidebar } from '@/components/Sidebar'
import { TrashView } from '@/components/TrashView'
import { useApp } from '@/store/app'

export default function App() {
  const { init, view, error, backupMessage, repo } = useApp()

  useEffect(() => {
    void init()
  }, [init])

  if (error) return <div className="p-8 text-red-500">{error}</div>
  if (!repo) return <div className="p-8 text-[var(--fg-muted)]">Chargement…</div>

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="relative min-w-0 flex-1 overflow-y-auto">
        {backupMessage && (
          <div className="bg-[var(--bg-side)] px-4 py-1 text-center text-xs text-[var(--fg-muted)]">{backupMessage}</div>
        )}
        {view === 'page' && <PageView />}
        {view === 'trash' && <TrashView />}
        {view === 'settings' && <SettingsView />}
      </main>
    </div>
  )
}
