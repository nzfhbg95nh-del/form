import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronsUpDown, X } from 'lucide-react'

interface Anchor { x: 'left' | 'right' | 'center'; y: 'top' | 'bottom'; dx?: number; dy?: number }
interface Saved { x: number; y: number; collapsed: boolean }

const KEY = (id: string) => `form-panel-${id}`
const read = (id: string): Saved | null => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY(id)) ?? 'null')
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y, collapsed: !!v.collapsed } : null
  } catch { return null }
}
const write = (id: string, v: Saved) => { try { localStorage.setItem(KEY(id), JSON.stringify(v)) } catch { /* sans importance */ } }

/**
 * Un panneau flottant du moodboard (Caractère, Aligner, Palette, Réglages…) : on le déplace en tirant sa barre de titre, on le réduit en une
 * petite icône (un clic sur l'icône le rouvre), et sa place est retenue d'une fois sur l'autre. Il reste toujours dans la toile.
 */
export function FloatPanel({ id, title, icon, anchor, className = '', onClose, children }: {
  id: string; title: string; icon: ReactNode; anchor: Anchor; className?: string; onClose?: () => void; children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<Saved | null>(() => read(id))
  const drag = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null)

  const bounds = () => {
    const parent = box.current?.offsetParent as HTMLElement | null
    return { w: parent?.clientWidth ?? 800, h: parent?.clientHeight ?? 600 }
  }
  const clamp = (x: number, y: number) => {
    const { w, h } = bounds()
    const bw = box.current?.offsetWidth ?? 0
    const bh = box.current?.offsetHeight ?? 0
    return { x: Math.max(4, Math.min(x, w - bw - 4)), y: Math.max(4, Math.min(y, h - bh - 4)) }
  }

  // Première place : l'ancre donnée (par exemple en bas à droite), calculée une fois que la taille du panneau est connue ; ensuite, on reste dans la toile.
  useLayoutEffect(() => {
    if (!box.current) return
    if (state === null) {
      const { w, h } = bounds()
      const bw = box.current.offsetWidth
      const bh = box.current.offsetHeight
      const dx = anchor.dx ?? 12
      const dy = anchor.dy ?? 12
      const x = anchor.x === 'left' ? dx : anchor.x === 'right' ? w - bw - dx : (w - bw) / 2
      const y = anchor.y === 'top' ? dy : h - bh - dy
      setState({ ...clamp(x, y), collapsed: false })
    } else {
      const c = clamp(state.x, state.y)
      if (c.x !== state.x || c.y !== state.y) setState({ ...state, ...c })
    }
  })

  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')?.dataset.nodrag !== undefined) return
    if (!state) return
    drag.current = { px: e.clientX, py: e.clientY, x: state.x, y: state.y, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !state) return
    if (!d.moved && Math.hypot(e.clientX - d.px, e.clientY - d.py) < 4) return
    d.moved = true
    setState({ ...state, ...clamp(d.x + e.clientX - d.px, d.y + e.clientY - d.py) })
  }
  const endDrag = (toggleIfClick: boolean) => {
    const d = drag.current
    drag.current = null
    if (!state) return
    if (d && !d.moved && toggleIfClick) {
      const next = { ...state, collapsed: !state.collapsed }
      setState(next)
      write(id, next)
    } else if (d?.moved) write(id, state)
  }

  const place = { left: state?.x ?? 0, top: state?.y ?? 0, visibility: state ? ('visible' as const) : ('hidden' as const) }

  if (state?.collapsed) {
    return (
      <div
        ref={box}
        data-ui
        title={`${title} (clic : rouvrir, glisser : déplacer)`}
        className="absolute z-30 flex h-9 w-9 cursor-grab touch-none items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] shadow-[var(--shadow-lift)] active:cursor-grabbing"
        style={place}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => endDrag(true)}
        onPointerCancel={() => endDrag(false)}
      >
        {icon}
      </div>
    )
  }

  return (
    <div
      ref={box}
      data-ui
      data-scroll
      className={'absolute z-30 flex max-h-[calc(100%-16px)] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--fg)] shadow-[var(--shadow-lift)] ' + className}
      style={place}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
    >
      <div
        className="flex shrink-0 cursor-grab touch-none select-none items-center gap-2 border-b border-[var(--border)] px-3 py-1.5 active:cursor-grabbing"
        title="Tire pour déplacer le panneau"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => endDrag(false)}
        onPointerCancel={() => endDrag(false)}
      >
        <span className="text-[var(--fg-muted)]">{icon}</span>
        <span className="lib-count flex-1 truncate">{title}</span>
        <button data-nodrag className="rounded-md p-0.5 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]" title="Réduire en icône" aria-label={`Réduire le panneau ${title}`} onClick={() => { const next = { ...state!, collapsed: true }; setState(next); write(id, next) }}><ChevronsUpDown size={13} /></button>
        {onClose && <button data-nodrag className="rounded-md p-0.5 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]" title="Fermer" aria-label={`Fermer le panneau ${title}`} onClick={onClose}><X size={13} /></button>}
      </div>
      <div data-scroll className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">{children}</div>
    </div>
  )
}
