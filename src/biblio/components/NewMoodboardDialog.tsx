import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'

/** La fenêtre « Créer un moodboard » : un aperçu avec une photo de couverture au choix, le nom, et un grand bouton Créer. */
export function NewMoodboardDialog({ onCreate, onClose }: { onCreate: (name: string, cover: File | null) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [cover, setCover] = useState<File | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const filePicker = useRef<HTMLInputElement>(null)
  const ready = name.trim().length > 0
  useEffect(() => input.current?.focus(), [])
  const preview = useMemo(() => (cover ? URL.createObjectURL(cover) : null), [cover])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const submit = () => {
    if (ready) onCreate(name.trim(), cover)
  }
  const tile = { background: 'var(--bg-hover)' }
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

        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            className="group relative grid aspect-[3/2] w-60 gap-0.5 overflow-hidden rounded-2xl"
            style={{ gridTemplateColumns: '2fr 1fr', gridTemplateRows: '1fr 1fr', background: 'var(--bg)' }}
            onClick={() => filePicker.current?.click()}
            aria-label={cover ? 'Changer la photo de couverture' : 'Ajouter une photo de couverture'}
          >
            <div className="relative row-span-2 flex items-center justify-center" style={tile}>
              {preview ? (
                <img src={preview} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-2 px-2 text-center text-xs font-medium" style={{ color: 'var(--fg-muted)' }}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' }}><ImagePlus size={18} /></span>
                  Ajouter une photo de couverture
                </span>
              )}
            </div>
            <div style={tile} />
            <div style={tile} />
            <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
          </button>
          <input
            ref={filePicker}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setCover(f)
              e.target.value = ''
            }}
          />
          <div className="flex h-8 items-center gap-1.5 text-xs" style={{ color: 'var(--fg-muted)' }}>
            {cover ? (
              <>
                <button className="rounded-lg bg-[var(--bg-hover)] px-2.5 py-1 font-medium text-[var(--fg)] transition-colors hover:brightness-95" onClick={() => filePicker.current?.click()}>Changer la photo</button>
                <button className="rounded-lg px-2.5 py-1 transition-colors hover:bg-[var(--bg-hover)]" onClick={() => setCover(null)}>Retirer</button>
              </>
            ) : (
              'Facultatif : tu pourras la changer plus tard.'
            )}
          </div>
        </div>

        <label className="mt-4 block rounded-2xl border px-4 py-2 focus-within:border-[var(--accent)]" style={{ borderColor: 'var(--border)' }}>
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

        <button className="btn btn-primary mt-5 w-full justify-center py-3 text-base disabled:opacity-40" disabled={!ready} onClick={submit}>Créer</button>
      </div>
    </div>
  )
}
