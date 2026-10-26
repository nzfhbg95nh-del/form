import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/** Bouton qui ouvre un petit panneau ; se ferme d'un clic à côté ou avec Échap. */
export function Popover({ label, active, children, width = 260 }: { label: string; active?: boolean; children: ReactNode; width?: number }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const played = useRef(false)

  // Ouverture « liquide » (comme la pastille de la maquette) : le panneau naît du bouton, comme une goutte qui s'étire vers le bas,
  // d'abord petit et tout rond, puis il s'ouvre avec un petit ressort pendant que son contenu apparaît.
  useLayoutEffect(() => {
    if (!open) { played.current = false; return }
    if (!pos || played.current || !panel.current || !button.current) return
    played.current = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const b = button.current.getBoundingClientRect()
    const p = panel.current.getBoundingClientRect()
    if (p.width === 0 || p.height === 0) return
    const rightInset = Math.max(0, p.width - b.width)
    const bottomInset = Math.max(0, p.height - b.height)
    const drop = -(b.height + 4)
    const timing: KeyframeAnimationOptions = { duration: 520, easing: 'cubic-bezier(0.34, 1.25, 0.64, 1)' }
    panel.current.animate(
      [
        { clipPath: `inset(0px ${rightInset}px ${bottomInset}px 0px round ${b.height / 2}px)`, transform: `translateY(${drop}px)` },
        { clipPath: 'inset(0px 0px 0px 0px round 12px)', transform: 'translateY(0)' },
      ],
      timing,
    )
    inner.current?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: 520, easing: 'ease-out' })
  }, [open, pos])

  // Le panneau est posé sous le bouton mais reste toujours dans la fenêtre : il ne se coupe plus sur le bord, même dans une petite fenêtre.
  const place = () => {
    const r = button.current?.getBoundingClientRect()
    if (!r) return
    const w = Math.min(width, window.innerWidth - 16)
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), top: r.bottom + 4, maxHeight: Math.max(160, window.innerHeight - r.bottom - 16) })
  }
  useEffect(() => {
    if (!open) return
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        ref={button}
        className="btn"
        onClick={() => setOpen((o) => !o)}
        style={active ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
        aria-expanded={open}
      >
        {label} <ChevronDown size={14} />
      </button>
      {open && pos && (
        <div
          ref={panel}
          className="fixed z-30 overflow-auto rounded-xl border p-2 shadow-lg"
          style={{ left: pos.left, top: pos.top, width: Math.min(width, window.innerWidth - 16), maxHeight: pos.maxHeight, background: 'var(--bg)', borderColor: 'var(--border)' }}
        >
          <div ref={inner}>{children}</div>
        </div>
      )}
    </div>
  )
}

export function CheckRow({ checked, onChange, children, count }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; count?: number }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--bg-hover)]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined && <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>{count}</span>}
    </label>
  )
}
