import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/** Bouton qui ouvre un petit panneau ; se ferme d'un clic à côté ou avec Échap. */
export function Popover({ label, active, children, width = 260 }: { label: string; active?: boolean; children: ReactNode; width?: number }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const played = useRef(false)

  // Ouverture « liquide » (comme la pastille de la maquette) : le panneau se détache du bouton comme une goutte. Une goutte s'étire vers le bas
  // depuis le bord du bouton (un filtre « goo » fond les deux formes en une seule), le fil qui les relie s'amincit puis casse, et le panneau,
  // devenu libre, prend sa place. Dessiné par-dessus pendant 0,7 s, puis le vrai panneau (avec son contour) apparaît.
  useLayoutEffect(() => {
    if (!open) { played.current = false; return }
    if (!pos || played.current || !panel.current || !button.current) return
    played.current = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const b = button.current.getBoundingClientRect()
    const p = panel.current.getBoundingClientRect()
    if (p.width === 0 || p.height === 0) return
    const D = 440
    const ease = 'cubic-bezier(0.22, 1.12, 0.36, 1)'
    // Le dessin liquide ne couvre que la zone utile (bouton + panneau + marge) : le filtre ne travaille pas sur tout l'écran, donc c'est fluide.
    const M = 36
    const ox = Math.min(b.left, p.left) - M
    const oy = b.top - M
    const w = Math.max(b.right, p.right) - ox + M
    const h = p.bottom - oy + M
    const stage = document.createElement('div')
    stage.style.cssText = `position:fixed;left:${ox}px;top:${oy}px;width:${w}px;height:${h}px;pointer-events:none;z-index:29;filter:url(#form-goo);will-change:opacity`
    const blob = (css: string) => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;will-change:transform;' + css; stage.appendChild(d); return d }
    const tint = 'color-mix(in srgb, var(--fg) 9%, var(--bg))'
    // A : l'ancre, sur le bord bas du bouton. B : la goutte, de la taille finale du panneau, qu'on étire par transformation (très fluide).
    const anchor = blob(`left:${b.left - ox + b.width * 0.15}px;top:${b.bottom - oy - 8}px;width:${b.width * 0.7}px;height:14px;border-radius:999px;background:${tint};transform-origin:50% 0`)
    const drop = blob(`left:${p.left - ox}px;top:${p.top - oy}px;width:${p.width}px;height:${p.height}px;border-radius:16px;background:${tint};transform-origin:0 0`)
    document.body.appendChild(stage)
    const sx = Math.min(b.width, p.width) / p.width
    const sy = 12 / p.height
    const startY = b.bottom - 6 - p.top
    anchor.animate([{ transform: 'scale(1)', offset: 0 }, { transform: 'scale(1)', offset: 0.4 }, { transform: 'scale(0.15, 0)', offset: 1 }], { duration: D, easing: 'ease-in', fill: 'forwards' })
    drop.animate(
      [
        { transform: `translateY(${startY}px) scale(${sx}, ${sy})` },
        { transform: 'translateY(0) scale(1, 1)' },
      ],
      { duration: D, easing: ease, fill: 'forwards' },
    )
    // Le vrai panneau se montre en fondu pendant que le dessin liquide s'efface (les deux se recouvrent un instant : pas de saut).
    panel.current.animate([{ opacity: 0 }, { opacity: 0, offset: 0.55 }, { opacity: 1 }], { duration: D })
    stage.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: D, fill: 'forwards' }).onfinish = () => stage.remove()
    return () => stage.remove()
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
      {/* Le filtre « goo » : il fond les formes proches en une seule (effet liquide). */}
      <svg width="0" height="0" aria-hidden style={{ position: 'absolute' }}>
        <defs>
          <filter id="form-goo" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" />
          </filter>
        </defs>
      </svg>
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
          {children}
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
