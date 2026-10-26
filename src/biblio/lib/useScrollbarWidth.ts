import { useEffect, useRef, useState } from 'react'

/** Largeur de la barre de défilement d'une zone : la barre du haut en tient compte pour que ses boutons tombent sur le bord du contenu. */
export function useScrollbarWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.offsetWidth - el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}
