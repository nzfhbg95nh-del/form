import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Copy, CornerUpRight, Link2, RefreshCw, Search, Trash2 } from 'lucide-react'
import { BACKGROUND_FILL, TEXT_INK } from '@/lib/blockKinds'
import { filterBlockActions, type BlockAction } from '@/lib/blockActions'

function iconOf(a: BlockAction): ReactNode {
  const r = a.run
  if (r.kind === 'color') {
    return r.colorKind === 'text'
      ? <span className="flex h-5 w-5 items-center justify-center rounded border text-xs font-semibold" style={{ color: TEXT_INK[r.color], borderColor: 'var(--border)' }}>A</span>
      : <span className="h-5 w-5 rounded border" style={{ background: BACKGROUND_FILL[r.color], borderColor: 'var(--border)' }} />
  }
  if (r.kind === 'turn') return <RefreshCw size={15} />
  if (r.kind === 'duplicate') return <Copy size={15} />
  if (r.kind === 'move') return <CornerUpRight size={15} />
  if (r.kind === 'link') return <Link2 size={15} />
  return <Trash2 size={15} />
}

/**
 * Ctrl+/ comme dans Notion : un champ de recherche et la liste des actions sur le bloc du curseur (ou les blocs sélectionnés).
 * Flèches pour choisir, Entrée pour appliquer, Échap ou clic ailleurs pour fermer.
 */
export function BlockActionsPalette({ actions, x, y, title, onPick, onClose }: {
  actions: BlockAction[]
  x: number
  y: number
  title: string
  onPick: (a: BlockAction) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const results = useMemo(() => filterBlockActions(actions, query), [actions, query])

  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('[data-block-actions]')) onClose()
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [onClose])

  // Reste dans l'écran : la fenêtre s'ouvre sous le bloc, ou au-dessus s'il n'y a pas la place.
  const width = 300
  const height = 360
  const left = Math.max(8, Math.min(x, window.innerWidth - width - 8))
  const top = y + height + 8 > window.innerHeight ? Math.max(8, y - height - 36) : y

  let lastGroup = ''
  return (
    <div
      data-block-actions
      className="form-menu flush fixed z-50 flex flex-col overflow-hidden"
      style={{ left, top, width, maxHeight: height }}
    >
      <label className="m-2 flex items-center gap-2 rounded-md px-2 py-1.5" style={{ background: 'color-mix(in srgb, var(--fg) 6%, transparent)' }}>
        <Search size={14} className="shrink-0 text-[var(--fg-muted)]" />
        <input
          ref={input}
          value={query}
          placeholder="Rechercher des actions…"
          aria-label="Rechercher des actions"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--fg-muted)]"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') { e.preventDefault(); onClose() }
            else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
            else if (e.key === 'Enter') { e.preventDefault(); const a = results[active]; if (a) onPick(a) }
          }}
        />
      </label>
      <div className="px-3 pb-1 text-xs font-medium text-[var(--fg-muted)]">{title}</div>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto pb-1" role="listbox" aria-label="Actions du bloc">
        {results.length === 0 && <div className="px-3 py-3 text-sm text-[var(--fg-muted)]">Aucune action</div>}
        {results.map((a, i) => {
          const header = a.group !== lastGroup ? a.group : null
          lastGroup = a.group
          return (
            <div key={a.key}>
              {header && <div className="px-3 pb-0.5 pt-2 text-xs font-semibold text-[var(--fg-muted)]">{header}</div>}
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                data-index={i}
                className="mx-1 flex w-[calc(100%-8px)] items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm"
                style={{ background: i === active ? 'var(--bg-hover)' : undefined }}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(a)}
              >
                <span className="flex w-5 shrink-0 justify-center text-[var(--fg-muted)]">{iconOf(a)}</span>
                <span className="min-w-0 flex-1 truncate">{a.label}</span>
                {a.shortcut && <span className="shrink-0 text-xs text-[var(--fg-muted)]">{a.shortcut}</span>}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
