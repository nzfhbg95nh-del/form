import { create } from 'zustand'

interface ToastAction {
  label: string
  run: () => void
}

interface ToastState {
  text: string | null
  action: ToastAction | null
  /** Affiche un court message en bas de l'écran (il disparaît tout seul), avec un bouton facultatif (« Annuler »…). */
  show: (text: string, action?: ToastAction) => void
  hide: () => void
}

let timer: ReturnType<typeof setTimeout> | undefined

export const useToast = create<ToastState>((set) => ({
  text: null,
  action: null,
  show(text, action) {
    clearTimeout(timer)
    set({ text, action: action ?? null })
    timer = setTimeout(() => set({ text: null, action: null }), action ? 8000 : 3200)
  },
  hide() {
    clearTimeout(timer)
    set({ text: null, action: null })
  },
}))
