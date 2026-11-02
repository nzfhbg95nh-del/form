import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

/** La fenêtre « Créer un moodboard » : un aperçu de ce qui sera créé, le nom, et un grand bouton Créer. */
export function NewMoodboardDialog({ onCreate, onClose }: { onCreate: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const ready = name.trim().length > 0
  useEffect(() => input.current?.focus(), [])
  const submit = () => {
    if (ready) onCreate(name.trim())
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') onClose()
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Créer un moodboard" className="w-full max-w-md rounded-3xl border p-6 shadow-[var(--shadow-lift)]" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        <div className="relative">
          <h2 className="text-center text-xl font-semibold">Créer un moodboard</h2>
          <button className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full p-1.5 hover:bg-[var(--bg-hover)]" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>

        <div className="mx-auto mt-6 grid aspect-[3/2] w-52 gap-0.5 overflow-hidden rounded-2xl" style={{ gridTemplateColumns: '2fr 1fr', gridTemplateRows: '1fr 1fr', background: 'var(--bg)' }} aria-hidden>
          <div className="row-span-2" style={{ background: 'var(--bg-hover)' }} />
          <div style={{ background: 'var(--bg-hover)' }} />
          <div style={{ background: 'var(--bg-hover)' }} />
        </div>

        <label className="mt-6 block rounded-2xl border px-4 py-2 focus-within:border-[var(--accent)]" style={{ borderColor: 'var(--border)' }}>
          <span className="block text-xs">Nom du moodboard</span>
          <input
            ref={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            placeholder="Donne un nom à ton moodboard"
            className="mt-0.5 w-full bg-transparent text-base outline-none placeholder:text-[var(--fg-muted)]"
          />
        </label>
        <p className="mt-2 px-1 text-xs" style={{ color: 'var(--fg-muted)' }}>Tu pourras y poser des images depuis la bibliothèque ou directement sur la toile.</p>

        <button className="btn btn-primary mt-5 w-full justify-center py-3 text-base disabled:opacity-40" disabled={!ready} onClick={submit}>Créer</button>
      </div>
    </div>
  )
}
