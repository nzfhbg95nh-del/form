// Les confirmations de Form : une fenêtre à l'image de l'appli (au lieu de la petite boîte grise de Windows), la même partout.
// Utilisation : `if (await askConfirm('Supprimer ce client ?')) …` ou `askConfirm(…).then((ok) => ok && …)`.

import { create } from 'zustand'

export interface ConfirmStyle {
  danger: boolean
  label: string
}

/** Une question qui commence par « Supprimer… » ou « Mettre à la corbeille… » est dangereuse : bouton rouge, nommé d'après l'action. */
export function confirmStyle(message: string): ConfirmStyle {
  if (/^supprimer/i.test(message)) return { danger: true, label: 'Supprimer' }
  if (/^mettre à la corbeille/i.test(message)) return { danger: true, label: 'Mettre à la corbeille' }
  if (/^remettre/i.test(message)) return { danger: true, label: 'Remettre' }
  return { danger: false, label: 'Confirmer' }
}

interface Pending {
  message: string
  danger: boolean
  label: string
  resolve: (ok: boolean) => void
}

interface ConfirmState {
  pending: Pending | null
}

export const useConfirm = create<ConfirmState>(() => ({ pending: null }))

/** Pose la question et attend la réponse (`true` : confirmé). Une question déjà ouverte est annulée. */
export function askConfirm(message: string, options: { danger?: boolean; label?: string } = {}): Promise<boolean> {
  const base = confirmStyle(message)
  return new Promise<boolean>((resolve) => {
    useConfirm.getState().pending?.resolve(false)
    useConfirm.setState({ pending: { message, danger: options.danger ?? base.danger, label: options.label ?? base.label, resolve } })
  })
}

/** Ferme la fenêtre avec cette réponse. */
export function answerConfirm(ok: boolean) {
  const p = useConfirm.getState().pending
  useConfirm.setState({ pending: null })
  p?.resolve(ok)
}
