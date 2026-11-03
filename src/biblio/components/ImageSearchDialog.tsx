import { useEffect, useRef, useState } from 'react'
import { ArrowUp, X } from 'lucide-react'
import { isSearchableImage } from '@/biblio/lib/imageSearchPure.ts'

/** « Importer une image pour effectuer une recherche » : on dépose, on colle (Ctrl+V) ou on choisit une image, et la bibliothèque montre ses images semblables. */
export function ImageSearchDialog({ onPick, onClose }: { onPick: (image: File) => void; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const take = (file: File | undefined) => {
    if (!file) return
    if (!isSearchableImage(file)) {
      setProblem('Ce fichier n’est pas une image.')
      return
    }
    onPick(file)
    onClose()
  }

  // Ctrl+V : une image copiée (web, capture d'écran) lance la recherche.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find(isSearchableImage)
      if (!file) return
      e.preventDefault()
      take(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Importer une image pour effectuer une recherche" className="w-full max-w-xl rounded-3xl border p-6 shadow-[var(--shadow-lift)]" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold">Importer une image pour effectuer une recherche</h2>
          <button className="rounded-full p-1.5 hover:bg-[var(--bg-hover)]" onClick={onClose} aria-label="Fermer"><X size={20} /></button>
        </div>

        <button
          className="mt-5 flex h-64 w-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed transition-colors"
          style={{ borderColor: 'var(--accent)', background: over ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'color-mix(in srgb, var(--accent) 7%, transparent)' }}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            take(Array.from(e.dataTransfer.files).find(isSearchableImage) ?? e.dataTransfer.files[0])
          }}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full border-2" style={{ borderColor: 'var(--fg)' }}><ArrowUp size={24} /></span>
          <span className="text-base">Choisis un fichier ou glisse-le ici</span>
          <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>Tu peux aussi coller une image avec Ctrl+V</span>
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            take(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {problem && <p className="mt-3 text-sm" style={{ color: '#d44c47' }}>{problem}</p>}
        <p className="mt-4 text-xs" style={{ color: 'var(--fg-muted)' }}>La recherche se fait sur ton ordinateur : l’image n’est envoyée nulle part.</p>
      </div>
    </div>
  )
}
