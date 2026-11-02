import { useEffect, useMemo, useRef, useState } from 'react'
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

/** Une petite action sous l'aperçu : icône teintée et texte, dans le style des cartes de l'appli. */
function SmallAction({ icon, children, onClick, danger = false }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)]" style={{ color: danger ? '#d44c47' : 'var(--fg)' }} onClick={onClick}>
      <span className="flex h-5 w-5 items-center justify-center rounded-md" style={{ background: `color-mix(in srgb, ${danger ? '#d44c47' : 'var(--fg)'} ${danger ? 14 : 8}%, transparent)` }}>{icon}</span>
      {children}
    </button>
  )
}

/** La fenêtre « Créer un moodboard » (ou « Modifier le moodboard ») : un aperçu avec une photo de couverture au choix, le nom, et un grand bouton. */
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

        <div className="mt-6 flex flex-col items-stretch gap-2">
          <button
            className={'group relative aspect-[16/9] w-full overflow-hidden rounded-2xl transition-colors ' + (shown ? '' : 'border-2 border-dashed hover:bg-[var(--bg-hover)]')}
            style={shown ? { background: 'var(--bg-hover)' } : { borderColor: 'var(--border)' }}
            onClick={() => filePicker.current?.click()}
            aria-label={shown ? 'Changer la photo de couverture' : 'Ajouter une photo de couverture'}
          >
            {shown ? (
              <>
                <img src={shown} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
              </>
            ) : (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-xs font-medium" style={{ color: 'var(--fg-muted)' }}>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' }}><ImagePlus size={20} /></span>
                Ajouter une photo de couverture
              </span>
            )}
          </button>          <input
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
          <div className="flex min-h-8 flex-wrap items-center justify-center gap-1 text-xs" style={{ color: 'var(--fg-muted)' }}>
            {shown ? (
              <>
                <SmallAction icon={<Pencil size={11} />} onClick={() => filePicker.current?.click()}>Changer la photo</SmallAction>
                <SmallAction
                  icon={<Trash2 size={11} />}
                  danger
                  onClick={() => {
                    setCover(null)
                    if (edit?.coverSrc) setCoverRemoved(true)
                  }}
                >
                  Retirer
                </SmallAction>
              </>
            ) : (
              <span>Facultatif : tu pourras la changer plus tard.</span>
            )}
            {onPickFromBoard && <SmallAction icon={<Images size={11} />} onClick={onPickFromBoard}>Choisir parmi ses images</SmallAction>}
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

        <button className="btn btn-primary mt-5 w-full justify-center py-3 text-base disabled:opacity-40" disabled={!ready} onClick={submit}>{edit ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </div>
  )
}
