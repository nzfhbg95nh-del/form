import { useEffect, useRef } from 'react'
import { answerConfirm, useConfirm } from '@/lib/confirm'

/** La fenêtre de confirmation de Form (voir `askConfirm`). À poser une seule fois, dans App. Échap annule ; Entrée confirme une question sans danger. */
export function ConfirmHost() {
  const pending = useConfirm((s) => s.pending)
  const cancel = useRef<HTMLButtonElement>(null)
  const ok = useRef<HTMLButtonElement>(null)

  // Une action dangereuse laisse le focus sur « Annuler » : un Entrée distrait ne supprime rien.
  useEffect(() => {
    if (pending) (pending.danger ? cancel.current : ok.current)?.focus()
  }, [pending])

  if (!pending) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-6" onMouseDown={() => answerConfirm(false)}>
      <div
        role="alertdialog"
        aria-label="Confirmation"
        aria-describedby="confirm-message"
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); answerConfirm(false) } }}
      >
        <p id="confirm-message" className="whitespace-pre-line text-sm leading-relaxed text-[var(--fg)]">{pending.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancel} className="btn" onClick={() => answerConfirm(false)}>Annuler</button>
          <button
            ref={ok}
            className={'rounded px-4 py-1.5 text-sm text-white hover:opacity-90 ' + (pending.danger ? 'bg-[#d44c47]' : 'bg-[var(--accent)]')}
            onClick={() => answerConfirm(true)}
          >
            {pending.label}
          </button>
        </div>
      </div>
    </div>
  )
}
