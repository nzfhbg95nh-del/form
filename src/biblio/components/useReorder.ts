import { useState, type DragEvent } from 'react'
import { reorderIds } from '@/biblio/lib/collections.ts'

/**
 * Glisser-déposer pour changer l'ordre d'une liste de cartes. `props(id)` donne ce qu'il faut mettre sur chaque carte ;
 * `over` est la carte survolée (pour la mettre en évidence) et `dragging` celle qu'on tient.
 */
export function useReorder(ids: readonly string[], onOrder: (next: string[]) => void) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const end = () => {
    setDragging(null)
    setOver(null)
  }
  return {
    dragging,
    over,
    props: (id: string) => ({
      draggable: true,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', id)
        setDragging(id)
      },
      onDragOver: (e: DragEvent) => {
        if (!dragging) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (over !== id) setOver(id)
      },
      onDragLeave: () => setOver((cur) => (cur === id ? null : cur)),
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        if (dragging && dragging !== id) {
          const next = reorderIds(ids, dragging, id)
          if (next.join('|') !== ids.join('|')) onOrder(next)
        }
        end()
      },
      onDragEnd: end,
    }),
  }
}
