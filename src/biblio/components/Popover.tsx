import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/** Bouton qui ouvre un petit panneau ; se ferme d'un clic à côté ou avec Échap. */
export function Popover({ label, active, children, width = 260 }: { label: string; active?: boolean; children: ReactNode; width?: number }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)


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
