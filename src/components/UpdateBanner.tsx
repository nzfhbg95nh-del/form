import { useEffect, useState } from 'react'
import { useApp } from '@/store/app'

/** Bandeau « nouvelle version disponible » : installe en un clic, puis Form redémarre. */
export function UpdateBanner() {
  const update = useApp((s) => s.availableUpdate)
  const dismissed = useApp((s) => s.updateDismissed)
  const dismissUpdate = useApp((s) => s.dismissUpdate)
  const [progress, setProgress] = useState<number | null | 'idle'>('idle')
  const [error, setError] = useState('')

  // Quand une autre version est annoncée plus tard, on repart de zéro.
  useEffect(() => {
    setProgress('idle')
    setError('')
  }, [update?.version])

  if (!update || dismissed) return null
  const busy = progress !== 'idle'

  const install = async () => {
    setError('')
    setProgress(null)
    try {
      await update.install((p) => setProgress(p))
    } catch (e) {
      setProgress('idle')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-3 border-b border-[var(--border)] bg-[var(--bg-side)] px-4 py-1.5 text-sm">
      <span>
        Une nouvelle version de Form est disponible : <strong>{update.version}</strong>.
        {busy && <span className="ml-2 text-[var(--fg-muted)]">Téléchargement{typeof progress === 'number' ? ` ${progress} %` : '…'} (Form va redémarrer)</span>}
        {error && <span className="ml-2 text-red-500">{error}</span>}
      </span>
      {!busy && (
        <>
          <button className="rounded bg-[var(--accent)] px-3 py-0.5 text-white" onClick={() => void install()}>Installer et redémarrer</button>
          <button className="rounded px-2 py-0.5 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]" onClick={dismissUpdate}>Plus tard</button>
        </>
      )}
    </div>
  )
}
