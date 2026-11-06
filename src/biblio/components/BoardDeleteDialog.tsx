import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { CollectionCard } from '@/biblio/lib/collections.ts'
import { useCollections } from '@/biblio/store/collections.ts'

/** « Supprimer ce tableau ? » : on choisit de garder ou d'envoyer à la corbeille les images du tableau. */
export function BoardDeleteDialog({ card, onClose }: { card: CollectionCard; onClose: () => void }) {
  const removeBoard = useCollections((s) => s.removeBoard)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const go = (withImages: boolean) => {
    if (busy) return
    setBusy(true)
    void removeBoard(card.id, withImages).catch(() => undefined).finally(onClose)
  }

  const n = card.count
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-6" onMouseDown={onClose} onClick={(e) => e.stopPropagation()}>
      <div
        className="relative w-full max-w-md rounded-3xl p-7 shadow-2xl"
        style={{ background: 'var(--bg)', color: 'var(--fg)' }}
        role="dialog"
        aria-label="Supprimer le tableau"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="absolute right-4 top-4 rounded-full p-2 hover:bg-[var(--bg-hover)]" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        <h2 className="mb-1 pr-8 text-lg font-semibold">Supprimer « {card.name} » ?</h2>
        <p className="mb-5 text-sm" style={{ color: 'var(--fg-muted)' }}>
          Ce tableau contient {n} image{n > 1 ? 's' : ''}. Que faire de {n > 1 ? 'ses images' : 'son image'} ?
        </p>
        <div className="flex flex-col gap-2">
          <button className="btn justify-start text-left" disabled={busy} onClick={() => go(false)}>
            Supprimer le tableau, garder les images
          </button>
          <button className="btn justify-start text-left" disabled={busy} style={{ color: '#d44c47' }} onClick={() => go(true)}>
            Supprimer le tableau et mettre ses images à la corbeille
          </button>
          <button className="btn justify-start text-left" disabled={busy} onClick={onClose}>Annuler</button>
        </div>
        <p className="mt-4 text-xs" style={{ color: 'var(--fg-muted)' }}>Les images à la corbeille se récupèrent depuis la corbeille de la bibliothèque. Aucun fichier n'est effacé de ton disque.</p>
      </div>
    </div>,
    document.body,
  )
}
