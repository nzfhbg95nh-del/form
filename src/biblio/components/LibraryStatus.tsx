import { useLibrary } from '@/biblio/store/library.ts'

/** Une ligne discrète sous « Bibliothèque » pendant que la bibliothèque se met à jour ; rien le reste du temps. */
export function LibraryStatus() {
  const phase = useLibrary((s) => s.phase)
  const label = useLibrary((s) => s.label)
  const text = phase !== 'idle' ? label || 'Mise à jour…' : ''
  if (!text) return null
  return <div className="px-2 py-1 text-xs text-[var(--fg-muted)]" role="status">{text}</div>
}
