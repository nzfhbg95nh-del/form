import { useEffect } from 'react'
import { ClientsView, ServicesView } from '@/components/BusinessViews'
import { InvoicesView } from '@/components/InvoicesView'
import { PaymentsView } from '@/components/PaymentsView'
import { QuotesView } from '@/components/QuotesView'
import { AssistantModal } from '@/components/AssistantModal'
import { DashboardView } from '@/components/DashboardView'
import { DatabaseView } from '@/components/DatabaseView'
import { MoodboardView } from '@/components/MoodboardView'
import { MailView } from '@/components/MailView'
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
import { copyText, pageLink, windowActions } from '@/lib/windowActions'
import { useReminders } from '@/lib/useReminders'
import { useApp } from '@/store/app'

export default function App() {
  const { init, view, error, backupMessage, repo, objects, selectedId, searchOpen, captureOpen, toast, setSearch, setCapture, peekId, movingId, assistantMode, setAssistant, sidebarHidden } = useApp()
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
      } else if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        const st = useApp.getState()
        if (st.tabs.ids.length > 1) st.closeTabAt(st.tabs.active)
      } else if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault()
        useApp.getState().reopenTab()
      } else if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === '\\') {
        e.preventDefault()
        useApp.getState().toggleSidebar()
      } else if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        useApp.getState().cycleTab(e.shiftKey ? -1 : 1)
      } else if (e.altKey && !e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        useApp.getState().goBack()
      } else if (e.altKey && !e.ctrlKey && e.key === 'ArrowRight') {
        e.preventDefault()
        useApp.getState().goForward()
      } else if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'l') {
        const st = useApp.getState()
        const page = st.objects.find((o) => o.id === st.selectedId)
        if (page) {
          e.preventDefault()
          void copyText(pageLink(page.id)).then(() => useApp.setState({ toast: 'Lien copié : colle-le dans la recherche (Ctrl+K).' }))
          window.setTimeout(() => useApp.setState({ toast: null }), 2500)
        }
      } else if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'l') {
        const st = useApp.getState()
        const page = st.objects.find((o) => o.id === st.selectedId)
        if (page) {
          e.preventDefault()
          void copyText(page.title || 'Sans titre').then(() => useApp.setState({ toast: 'Nom copié.' }))
          window.setTimeout(() => useApp.setState({ toast: null }), 2500)
        }
      } else if (e.key === 'F11') {
        e.preventDefault()
        void windowActions.toggleFullscreen()
      } else if (e.ctrlKey && !e.altKey && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        useApp.getState().setZoom(useApp.getState().zoom + 0.1)
      } else if (e.ctrlKey && !e.altKey && e.key === '-') {
        e.preventDefault()
        useApp.getState().setZoom(useApp.getState().zoom - 0.1)
      } else if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key === '0') {
        e.preventDefault()
        useApp.getState().setZoom(1)
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
      {!sidebarHidden && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        <TabBar />
        {backupMessage && (
          <div className="bg-[var(--bg-side)] px-4 py-1 text-center text-xs text-[var(--fg-muted)]">{backupMessage}</div>
        )}
        <div className="flex min-h-0 flex-1">
          <main className="relative min-w-0 flex-1 overflow-y-auto">
            {view === 'page' && (selected?.type === 'database' ? <DatabaseView key={selected.id} db={selected} /> : selected?.type === 'moodboard' ? <MoodboardView key={selected.id} board={selected} /> : <PageView />)}
            {view === 'trash' && <TrashView />}
            {view === 'settings' && <SettingsPage />}
            {view === 'clients' && <ClientsView />}
            {view === 'services' && <ServicesView />}
            {view === 'quotes' && <QuotesView />}
            {view === 'invoices' && <InvoicesView />}
            {view === 'payments' && <PaymentsView />}
            {view === 'dashboard' && <DashboardView />}
            {view === 'mail' && <MailView />}
          </main>
          {peekId && <PeekPanel key={peekId} id={peekId} />}
        </div>
      </div>
      {movingId && <MovePicker key={movingId} id={movingId} />}
      {assistantMode && <AssistantModal initialMode={assistantMode} onClose={() => setAssistant(null)} />}
      {searchOpen && <SearchPalette />}
      {captureOpen && <QuickCapture />}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-[var(--fg)] px-4 py-2 text-sm text-[var(--bg)] shadow-lg">{toast}</div>
      )}
    </div>
  )
}
