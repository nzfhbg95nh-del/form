import { useEffect } from 'react'
import { DatabaseView } from '@/components/DatabaseView'
import { PageView } from '@/components/PageView'
import { QuickCapture } from '@/components/QuickCapture'
import { SearchPalette } from '@/components/SearchPalette'
import { SettingsView } from '@/components/SettingsView'
import { Sidebar } from '@/components/Sidebar'
import { TrashView } from '@/components/TrashView'
import { isTauri } from '@/lib/repo'
import { useReminders } from '@/lib/useReminders'
import { useApp } from '@/store/app'

export default function App() {
  const { init, view, error, backupMessage, repo, objects, selectedId, searchOpen, captureOpen, toast, setSearch, setCapture } = useApp()
  const selected = objects.find((o) => o.id === selectedId && !o.deleted_at)

  useReminders()

  useEffect(() => {
    void init()
  }, [init])

  // Raccourcis dans l'app : Ctrl+K (recherche) et Ctrl+Alt+N (capture rapide).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearch(!useApp.getState().searchOpen)
      } else if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setCapture(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSearch, setCapture])

  // Raccourci global (même quand Form n'est pas au premier plan) : envoyé par la partie Windows.
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    let cancelled = false
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen('quick-capture', () => setCapture(true)).then((fn) => {
        if (cancelled) fn()
        else unlisten = fn
      }),
    )
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [setCapture])

  if (error) return <div className="p-8 text-red-500">{error}</div>
  if (!repo) return <div className="p-8 text-[var(--fg-muted)]">Chargement…</div>

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="relative min-w-0 flex-1 overflow-y-auto">
        {backupMessage && (
          <div className="bg-[var(--bg-side)] px-4 py-1 text-center text-xs text-[var(--fg-muted)]">{backupMessage}</div>
        )}
        {view === 'page' && (selected?.type === 'database' ? <DatabaseView key={selected.id} db={selected} /> : <PageView />)}
        {view === 'trash' && <TrashView />}
        {view === 'settings' && <SettingsView />}
      </main>
      {searchOpen && <SearchPalette />}
      {captureOpen && <QuickCapture />}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-[var(--fg)] px-4 py-2 text-sm text-[var(--bg)] shadow-lg">{toast}</div>
      )}
    </div>
  )
}
