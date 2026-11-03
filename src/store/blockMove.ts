import { create } from 'zustand'

/** La fenêtre « Déplacer ce bloc vers… » : la page de départ (qu'on ne propose pas) et ce qu'il faut faire quand on a choisi la page d'arrivée. */
interface BlockMoveState {
  from: string | null
  onPick: ((targetId: string) => void | Promise<void>) | null
  ask: (from: string | null, onPick: (targetId: string) => void | Promise<void>) => void
  close: () => void
  /** Un bloc qu'on est en train de glisser : la barre latérale s'en sert pour accepter un dépôt sur une page. */
  dragging: { from: string | null; drop: (targetId: string) => void | Promise<void> } | null
  setDragging: (d: BlockMoveState['dragging']) => void
}

export const useBlockMove = create<BlockMoveState>((set) => ({
  from: null,
  onPick: null,
  ask: (from, onPick) => set({ from, onPick }),
  close: () => set({ from: null, onPick: null }),
  dragging: null,
  setDragging: (dragging) => set({ dragging }),
}))