import { useEffect, useRef } from 'react'
import { answerConfirm, useConfirm } from '@/lib/confirm'
import { Dialog } from '@/components/Dialog'

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
    <Dialog
      role="alertdialog"
      label="Confirmation"
      z={100}
      onClose={() => answerConfirm(false)}
      footer={
        <>
          <button ref={cancel} className="btn" onClick={() => answerConfirm(false)}>Annuler</button>
          <button ref={ok} className={'btn ' + (pending.danger ? 'btn-danger' : 'btn-dark')} onClick={() => answerConfirm(true)}>{pending.label}</button>
        </>
      }
    >
      <p id="confirm-message" className="whitespace-pre-line text-sm leading-relaxed text-[var(--fg)]">{pending.message}</p>
    </Dialog>
  )
}
