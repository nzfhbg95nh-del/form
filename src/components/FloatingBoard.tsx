import { useEffect, useState } from 'react'
import { Pin, PinOff, X } from 'lucide-react'
import { MoodboardView } from '@/components/MoodboardView'
import { FLOATING_EVENT } from '@/lib/floating'
import { isTauri } from '@/lib/repo'
import { useApp } from '@/store/app'

const opacityKey = (id: string) => `form-floating-opacity-${id}`

/**
 * Contenu de la fenêtre flottante (façon PureRef) : une barre qu'on attrape pour déplacer la fenêtre,
 * un curseur de transparence, l'épingle « toujours devant » et le moodboard en version allégée.
 */
export function FloatingBoard({ id }: { id: string }) {
  const initFloating = useApp((s) => s.initFloating)
  const board = useApp((s) => s.objects.find((o) => o.id === id && !o.deleted_at))
  const ready = useApp((s) => s.repo !== null)
  const error = useApp((s) => s.error)
  const [pinned, setPinned] = useState(true)
  const [opacity, setOpacity] = useState(() => {
    try {
      const v = Number(localStorage.getItem(opacityKey(id)))
      return v >= 30 && v <= 100 ? v : 100
    } catch {
      return 100
    }
  })

  useEffect(() => {
    void initFloating()
  }, [initFloating])

  // La fenêtre principale est prévenue : tant que celle-ci est ouverte, elle ne modifie pas ce moodboard.
  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    const send = async (open: boolean) => {
      const { emit } = await import('@tauri-apps/api/event')
      await emit(FLOATING_EVENT, { id, open })
    }
    void send(true)
    const onUnload = () => { if (!cancelled) void send(false) }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      cancelled = true
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [id])

  useEffect(() => {
    document.documentElement.classList.add('floating')
    return () => document.documentElement.classList.remove('floating')
  }, [])

  const togglePin = async () => {
    if (!isTauri()) return setPinned(!pinned)
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().setAlwaysOnTop(!pinned)
    setPinned(!pinned)
  }
  const close = async () => {
    if (!isTauri()) return window.close()
    const { emit } = await import('@tauri-apps/api/event')
    await emit(FLOATING_EVENT, { id, open: false })
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().close()
  }
  const changeOpacity = (v: number) => {
    setOpacity(v)
    try { localStorage.setItem(opacityKey(id), String(v)) } catch { /* sans importance */ }
  }

  if (error) return <div className="p-4 text-sm text-red-500">{error}</div>
  if (!ready) return <div className="p-4 text-sm text-[var(--fg-muted)]">Chargement…</div>
  if (!board) return <div className="p-4 text-sm text-[var(--fg-muted)]">Ce moodboard n’existe plus.</div>

  const icon = 'rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]'
  return (
    <div className="flex h-screen flex-col overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]" style={{ opacity: opacity / 100 }}>
      <div data-tauri-drag-region className="flex shrink-0 select-none items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-side)] px-2 py-1 text-sm">
        <span data-tauri-drag-region className="min-w-0 flex-1 cursor-move truncate font-medium">{board.title || 'Moodboard'}</span>
        <input
          type="range"
          min={30}
          max={100}
          value={opacity}
          onChange={(e) => changeOpacity(Number(e.target.value))}
          aria-label="Transparence de la fenêtre"
          title="Transparence"
          className="h-1 w-20 accent-[var(--accent)]"
        />
        <button className={icon} onClick={() => void togglePin()} title={pinned ? 'Ne plus rester devant les autres fenêtres' : 'Rester devant les autres fenêtres'} aria-pressed={pinned}>
          {pinned ? <Pin size={14} /> : <PinOff size={14} />}
        </button>
        <button className={icon} onClick={() => void close()} title="Fermer" aria-label="Fermer la fenêtre flottante"><X size={14} /></button>
      </div>
      <div className="min-h-0 flex-1">
        <MoodboardView key={board.id} board={board} compact />
      </div>
    </div>
  )
}
