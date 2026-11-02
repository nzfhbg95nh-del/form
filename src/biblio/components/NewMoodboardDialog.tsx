import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Images, ImagePlus, Pencil, Trash2, X } from 'lucide-react'

interface Props {
  /** Chaque champ de la fenêtre : le nom, la photo choisie (ou rien) et si la couverture actuelle a été retirée. */
  onCreate: (name: string, cover: File | null, coverRemoved: boolean) => void
  onClose: () => void
  /** Présent = la fenêtre sert à modifier un moodboard existant (son nom et sa couverture actuelle). */
  edit?: { name: string; coverSrc: string | null }
  /** Modifier seulement : choisir la couverture parmi les images déjà posées sur le moodboard. */
  onPickFromBoard?: () => void
}

/** Une action à droite de la photo : une petite icône teintée, puis le texte (même style que le menu d'un moodboard). */
function SideAction({ icon, children, onClick, danger = false }: { icon: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) {
  const tint = danger ? '#d44c47' : 'var(--fg)'
  return (
    <button className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-sm transition-colors hover:bg-[var(--bg-hover)]" style={danger ? { color: '#d44c47' } : undefined} onClick={onClick}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${tint} ${danger ? 14 : 8}%, transparent)`, color: tint }}>{icon}</span>
      {children}
    </button>
  )
}

/** La fenêtre « Créer un moodboard » (ou « Modifier le moodboard ») : la photo de couverture et ses actions, le nom, et un grand bouton. */
export function NewMoodboardDialog({ onCreate, onClose, edit, onPickFromBoard }: Props) {
  const [name, setName] = useState(edit?.name ?? '')
  const [cover, setCover] = useState<File | null>(null)
  const [coverRemoved, setCoverRemoved] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const filePicker = useRef<HTMLInputElement>(null)
  const ready = name.trim().length > 0
  useEffect(() => {
    input.current?.focus()
    if (edit) input.current?.select()
  }, [edit])
  const picked = useMemo(() => (cover ? URL.createObjectURL(cover) : null), [cover])
  useEffect(() => () => { if (picked) URL.revokeObjectURL(picked) }, [picked])
  // L'aperçu : la photo qu'on vient de choisir, sinon la couverture actuelle (sauf si on l'a retirée).
  const shown = picked ?? (coverRemoved ? null : (edit?.coverSrc ?? null))
  const choose = () => filePicker.current?.click()
  const submit = () => {
    if (ready) onCreate(name.trim(), cover, coverRemoved && !cover)
  }
  const title = edit ? 'Modifier le moodboard' : 'Créer un moodboard'
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
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-3xl border p-6 shadow-[var(--shadow-lift)]" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        <div className="relative">
          <h2 className="text-center text-xl font-semibold">{title}</h2>
          <button className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full p-1.5 hover:bg-[var(--bg-hover)]" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>

        <div className="mt-6 flex items-start gap-4">
          <button
            className={'group relative aspect-[4/3] w-44 shrink-0 overflow-hidden rounded-2xl transition-colors ' + (shown ? '' : 'border-2 border-dashed hover:bg-[var(--bg-hover)]')}
            style={shown ? { background: 'var(--bg-hover)' } : { borderColor: 'var(--border)' }}
            onClick={choose}
            aria-label={shown ? 'Changer la photo de couverture' : 'Ajouter une photo de couverture'}
          >
            {shown ? (
              <>
                <img src={shown} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
              </>
            ) : (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' }}><ImagePlus size={20} /></span>
              </span>
            )}
          </button>
          <input
            ref={filePicker}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                setCover(f)
                setCoverRemoved(false)
              }
              e.target.value = ''
            }}
          />
          <div className="min-w-0 flex-1">
            {shown ? (
              <>
                <SideAction icon={<Pencil size={14} />} onClick={choose}>Changer la photo</SideAction>
                <SideAction
                  icon={<Trash2 size={14} />}
                  danger
                  onClick={() => {
                    setCover(null)
                    if (edit?.coverSrc) setCoverRemoved(true)
                  }}
                >
                  Retirer
                </SideAction>
              </>
            ) : (
              <SideAction icon={<ImagePlus size={14} />} onClick={choose}>Ajouter une photo</SideAction>
            )}
            {onPickFromBoard && <SideAction icon={<Images size={14} />} onClick={onPickFromBoard}>Parmi ses images</SideAction>}
          </div>
        </div>

        <label className="mt-5 block rounded-2xl border px-4 py-2 focus-within:border-[var(--accent)]" style={{ borderColor: 'var(--border)' }}>
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

        <button className="btn btn-primary mt-5 w-full justify-center py-3 text-base disabled:opacity-40" disabled={!ready} onClick={submit}>{edit ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </div>
  )
}
