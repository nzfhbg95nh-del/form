import { useEffect } from 'react'
import { ClientsView, ServicesView } from '@/components/BusinessViews'
import { DatabaseView } from '@/components/DatabaseView'
import { MovePicker } from '@/components/MovePicker'
import { PageView } from '@/components/PageView'
import { PeekPanel } from '@/components/PeekPanel'
import { QuickCapture } from '@/components/QuickCapture'
import { SearchPalette } from '@/components/SearchPalette'
import { SettingsPage } from '@/components/SettingsPage'
import { Sidebar } from '@/components/Sidebar'
import { TabBar } from '@/components/TabBar'
import { TrashView } from '@/components/TrashView'
import { isTauri } from '@/lib/repo'
import { useReminders } from '@/lib/useReminders'
import { useApp } from '@/store/app'

export default function App() {
  const { init, view, error, backupMessage, repo, objects, selectedId, searchOpen, captureOpen, toast, setSearch, setCapture, peekId, movingId } = useApp()
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
      } else if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault()
        setSearch(true, true)
      } else if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'd') {
        // Ctrl+D : dupliquer la page affichée (hors saisie de texte, pour ne rien casser dans l'éditeur).
        const id = useApp.getState().selectedId
        if (id) { e.preventDefault(); void useApp.getState().duplicate(id) }
      } else if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        const id = useApp.getState().selectedId
        if (id) useApp.getState().setRenaming(id)
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
      <div className="flex min-w-0 flex-1 flex-col">
        <TabBar />
        {backupMessage && (
          <div className="bg-[var(--bg-side)] px-4 py-1 text-center text-xs text-[var(--fg-muted)]">{backupMessage}</div>
        )}
        <div className="flex min-h-0 flex-1">
          <main className="relative min-w-0 flex-1 overflow-y-auto">
            {view === 'page' && (selected?.type === 'database' ? <DatabaseView key={selected.id} db={selected} /> : <PageView />)}
            {view === 'trash' && <TrashView />}
            {view === 'settings' && <SettingsPage />}
            {view === 'clients' && <ClientsView />}
            {view === 'services' && <ServicesView />}
          </main>
          {peekId && <PeekPanel key={peekId} id={peekId} />}
        </div>
      </div>
      {movingId && <MovePicker key={movingId} id={movingId} />}
      {searchOpen && <SearchPalette />}
      {captureOpen && <QuickCapture />}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-[var(--fg)] px-4 py-2 text-sm text-[var(--bg)] shadow-lg">{toast}</div>
      )}
    </div>
  )
}
