import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ImageIcon, X } from 'lucide-react'
import { isSearchableImage } from '@/biblio/lib/imageSearchPure.ts'
import { Joiner, KeyCap, MouseIcon } from '@/components/HelpCard'

/** Une case de la fenêtre, au style des cartes d'aide : un dessin, un filet, un titre et une phrase. */
function Panel({ art, title, text, onClick, glow }: { art: ReactNode; title: string; text: string; onClick?: () => void; glow?: boolean }) {
  const body = (
    <>
      <div className="flex h-16 items-center justify-center gap-4">{art}</div>
      <div className="my-4 h-px w-4/5" style={{ background: 'var(--border)' }} />
      <div className="text-[15px] font-semibold">{title}</div>
      <p className="mt-1 max-w-xs text-[13px] leading-snug text-[var(--fg-muted)]">{text}</p>
    </>
  )
  const cls = 'flex flex-col items-center rounded-xl px-5 pb-5 pt-6 text-center transition-all duration-150'
  const style = { background: glow ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-side))' : 'var(--bg-side)', outline: glow ? '2px solid var(--accent)' : 'none' }
  return onClick
    ? <button type="button" className={cls + ' hover:brightness-[0.98]'} style={style} onClick={onClick}>{body}</button>
    : <div className={cls} style={style}>{body}</div>
}

/** Une image dessinée qu'on dépose (la flèche de déplacement de la souris à côté). */
function DroppedImage() {
  return (
    <span className="relative flex h-14 w-12 items-center justify-center rounded-lg" style={{ background: 'var(--bg)', boxShadow: 'var(--slider-shadow)', color: 'var(--fg-muted)', transform: 'rotate(-6deg)' }}>
      <ImageIcon size={22} />
    </span>
  )
}

/**
 * « Chercher avec une image » (icône appareil photo) : on dépose, on colle (Ctrl+V) ou on choisit une image, et la bibliothèque montre
 * ses images semblables. Même dessin que les cartes d'aide. Toute la fenêtre accepte le dépôt.
 */
export function ImageSearchDialog({ onPick, onClose }: { onPick: (image: File) => void; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const choose = () => input.current?.click()

  const take = (file: File | undefined) => {
    if (!file) return
    if (!isSearchableImage(file)) {
      setProblem('Ce fichier n’est pas une image : choisis un JPG, un PNG ou un WebP.')
      return
    }
    onPick(file)
    onClose()
  }

  // Ctrl+V : une image copiée (web, capture d'écran) lance la recherche. Échap ferme.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find(isSearchableImage)
      if (!file) return
      e.preventDefault()
      take(file)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('paste', onPaste)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('keydown', onKey)
    }
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chercher avec une image"
        className="form-help w-[min(760px,calc(100vw-32px))] rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3"
        style={{ boxShadow: 'var(--shadow-lift)' }}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          take(Array.from(e.dataTransfer.files).find(isSearchableImage) ?? e.dataTransfer.files[0])
        }}
      >
        <div className="grid grid-cols-3 gap-3">
          <Panel glow={over} onClick={choose} art={<><MouseIcon button="left" drag /><DroppedImage /></>} title="Glisser une image" text="Depuis ton bureau ou un site, dépose-la n’importe où sur cette fenêtre." />
          <Panel art={<><KeyCap>Ctrl</KeyCap><Joiner>+</Joiner><KeyCap>V</KeyCap></>} title="Coller" text="Une capture d’écran ou une image copiée : colle-la ici." />
          <Panel onClick={choose} art={<MouseIcon button="left" />} title="Choisir un fichier" text="Clique ici pour prendre une image sur ton ordinateur." />
        </div>
        <div className="mt-3 flex items-center gap-2 px-1">
          <span className="min-w-0 flex-1 text-xs text-[var(--fg-muted)]">
            {problem ? <span style={{ color: '#d44c47' }}>{problem}</span> : 'La recherche se fait sur ton ordinateur : l’image n’est envoyée nulle part.'}
          </span>
          <button className="btn" onClick={onClose}><X size={14} /> Annuler</button>
          <button className="btn" style={{ background: 'var(--fg)', color: 'var(--bg)' }} onClick={choose}>Choisir un fichier</button>
        </div>
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
      </div>
    </div>
  )
}
