import { useEffect, useRef, useState } from 'react'
import { TOOL_GROUPS, type ToolInfo } from '@/lib/vectorTools'
import type { PaintStyle } from '@/lib/vectorEngine'

// Les icônes de VectorCraft (Lucide, ISC, et les siennes, MIT ou Apache-2.0) : des SVG qu'on dessine dans la couleur du texte.
const RAW = import.meta.glob('../assets/vc-icons/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const iconSource = (name: string) => RAW[`../assets/vc-icons/${name}.svg`] ?? RAW['../assets/vc-icons/square-dashed.svg'] ?? ''

/** Un outil du moteur, ou un des nôtres (`ours`) qui prend sa place dans la barre. */
export interface BarTool extends ToolInfo {
  /** L'identifiant de l'outil dans Form (le moteur : le même que le sien ; sinon select / text / hand). */
  tool: string
}

/** Les groupes de la barre : ceux de VectorCraft, dans son ordre, avec les outils que Form sait faire. */
const GROUP_FIRST = ['selection', 'directSelection', 'lasso', 'pen', 'curvature', 'type', 'lineSegment', 'rectangle', 'paintbrush', 'shaper', 'eraser', 'rotate', 'scale', 'eyedropper', 'hand']
const OURS: Record<string, string> = { selection: 'select', type: 'text', areaType: 'text', hand: 'hand' }
const HIDDEN = new Set(['typeOnPath', 'verticalType', 'verticalAreaType', 'verticalTypeOnPath', 'touchType'])

const HAND: ToolInfo = { id: 'hand', en: 'Hand Tool', label: 'Outil Main', shortcut: 'H', svg: 'hand' }

export const BAR_GROUPS: BarTool[][] = GROUP_FIRST.map((first) => {
  const g = first === 'hand' ? [HAND] : TOOL_GROUPS.find((x) => x[0].id === first) ?? []
  return g.filter((t) => !HIDDEN.has(t.id)).map((t) => ({ ...t, tool: OURS[t.id] ?? t.id }))
}).filter((g) => g.length > 0)

/** Touche → outil (« p », « shift+c »…), d'après les raccourcis de VectorCraft. */
export const SHORTCUTS: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const g of BAR_GROUPS) for (const t of g) {
    const sc = t.shortcut
    if (!sc || sc.length > 7 || !/^(Shift\+)?[A-Z]$/.test(sc)) continue
    map[sc.toLowerCase()] = t.tool
  }
  return map
})()

function ToolIcon({ svg, size = 18 }: { svg: string; size?: number }) {
  // Les flèches de sélection ont un fond noir (pleine) ou blanc (directe), quel que soit le thème.
  const fill = svg === 'dc-selection' ? '#000' : svg === 'dc-direct' ? '#fff' : null
  return (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      {fill && <span aria-hidden className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full" style={{ color: fill, fill }} dangerouslySetInnerHTML={{ __html: iconSource('dc-arrow-fill') }} />}
      <span aria-hidden className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full [&>svg]:[stroke-width:1.6]" dangerouslySetInnerHTML={{ __html: iconSource(svg) }} />
    </span>
  )
}

const labelOf = (t: BarTool) => t.label.replace(/^Outil /, 'Outil ')

/**
 * La barre d'outils du moodboard, à la manière de VectorCraft : un bouton par groupe, qui montre le dernier outil choisi du groupe ;
 * un appui long (ou un clic droit) ouvre la liste des outils du groupe, avec leur raccourci. En bas : remplissage et contour.
 */
export function VectorToolbar({ tool, onTool, paint, onPaint }: { tool: string; onTool: (t: string) => void; paint: PaintStyle; onPaint: (p: PaintStyle) => void }) {
  const [chosen, setChosen] = useState<Record<number, string>>({})
  const [open, setOpen] = useState<number | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const fired = useRef(false)
  const [active, setActive] = useState<'fill' | 'stroke'>('fill')
  const fillInput = useRef<HTMLInputElement>(null)
  const strokeInput = useRef<HTMLInputElement>(null)

  // L'outil choisi ailleurs (une touche) devient celui que son groupe montre.
  useEffect(() => {
    BAR_GROUPS.forEach((g, i) => { if (g.some((t) => t.tool === tool)) setChosen((c) => (g.find((t) => t.tool === tool && c[i] === t.id) ? c : { ...c, [i]: g.find((t) => t.tool === tool)!.id })) })
  }, [tool])

  const shown = (g: BarTool[], i: number) => g.find((t) => t.id === chosen[i]) ?? g[0]
  const isActive = (g: BarTool[]) => g.some((t) => t.tool === tool)

  const swap = () => onPaint({ ...paint, fill: paint.stroke, stroke: paint.fill ?? paint.stroke })
  const colorOf = (c: string | null, none: string) => c ?? none

  return (
    <div data-ui className="absolute left-3 top-14 z-30 flex max-h-[calc(100%-120px)] flex-col gap-1 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 shadow-sm" data-scroll>
      {BAR_GROUPS.map((g, i) => {
        const t = shown(g, i)
        return (
          <div key={g[0].id} className="relative">
            <button
              title={`${labelOf(t)}${t.shortcut ? ` (${t.shortcut})` : ''}`}
              aria-label={labelOf(t)}
              aria-pressed={isActive(g)}
              onPointerDown={g.length > 1 ? () => {
                fired.current = false
                window.clearTimeout(timer.current)
                timer.current = window.setTimeout(() => { fired.current = true; setOpen(i) }, 400)
              } : undefined}
              onPointerUp={() => window.clearTimeout(timer.current)}
              onPointerLeave={() => window.clearTimeout(timer.current)}
              onContextMenu={g.length > 1 ? (e) => { e.preventDefault(); setOpen(i) } : undefined}
              onClick={() => { if (fired.current) { fired.current = false; return } onTool(t.tool) }}
              className={'flex h-8 w-8 items-center justify-center rounded ' + (isActive(g) ? 'bg-[var(--accent)] text-white' : 'text-[var(--fg)] hover:bg-[var(--bg-hover)]')}
            >
              <ToolIcon svg={t.svg} />
            </button>
            {g.length > 1 && <span aria-hidden className="pointer-events-none absolute bottom-0.5 right-0.5 h-0 w-0 border-b-[5px] border-l-[5px] border-b-current border-l-transparent opacity-60" />}
            {open === i && (
              <>
                <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(null)} />
                <div role="menu" className="absolute left-full top-0 z-50 ml-2 flex min-w-64 flex-col rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 shadow-xl">
                  {g.map((x) => (
                    <button
                      key={x.id}
                      role="menuitem"
                      className={'flex items-center gap-3 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)] ' + (x.id === t.id ? 'text-[var(--accent)]' : '')}
                      onClick={() => { setOpen(null); setChosen((c) => ({ ...c, [i]: x.id })); onTool(x.tool) }}
                    >
                      <ToolIcon svg={x.svg} size={16} />
                      <span className="flex-1">{labelOf(x)}</span>
                      {x.shortcut && <span className="text-xs text-[var(--fg-muted)]">({x.shortcut})</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      })}

      {/* Remplissage et contour (comme dans la barre d'Illustrator) */}
      <div className="mt-1 flex flex-col items-center gap-1 border-t border-[var(--border)] pt-2">
        <div className="relative h-12 w-12">
          <button
            title="Contour (X pour passer du remplissage au contour)"
            aria-label="Couleur du contour"
            onClick={() => { setActive('stroke'); strokeInput.current?.click() }}
            className="absolute bottom-0 right-0 h-8 w-8 rounded-sm border border-[var(--border)]"
            style={{ background: 'var(--bg)', outline: active === 'stroke' ? '2px solid var(--accent)' : undefined }}
          >
            <span className="absolute inset-1.5 rounded-[1px] border-[5px]" style={{ borderColor: colorOf(paint.stroke, 'transparent'), background: 'var(--bg)' }} />
            {!paint.stroke && <span aria-hidden className="absolute inset-0 overflow-hidden"><span className="absolute left-0 top-1/2 h-[2px] w-[140%] origin-left -rotate-45 bg-red-500" /></span>}
          </button>
          <button
            title="Remplissage"
            aria-label="Couleur de remplissage"
            onClick={() => { setActive('fill'); fillInput.current?.click() }}
            className="absolute left-0 top-0 h-8 w-8 rounded-sm border border-[var(--border)]"
            style={{ background: paint.fill ?? 'var(--bg)', outline: active === 'fill' ? '2px solid var(--accent)' : undefined }}
          >
            {!paint.fill && <span aria-hidden className="absolute inset-0 overflow-hidden"><span className="absolute left-0 top-1/2 h-[2px] w-[140%] origin-left -rotate-45 bg-red-500" /></span>}
          </button>
          <input ref={fillInput} type="color" className="sr-only" tabIndex={-1} value={paint.fill ?? '#ffffff'} onChange={(e) => onPaint({ ...paint, fill: e.target.value })} aria-hidden />
          <input ref={strokeInput} type="color" className="sr-only" tabIndex={-1} value={paint.stroke ?? '#000000'} onChange={(e) => onPaint({ ...paint, stroke: e.target.value, sw: paint.sw > 0 ? paint.sw : 1 })} aria-hidden />
        </div>
        <div className="flex gap-1">
          <button title="Permuter le remplissage et le contour (Maj+X)" aria-label="Permuter" onClick={swap} className="rounded px-1 text-xs hover:bg-[var(--bg-hover)]">⇄</button>
          <button title="Remplissage et contour par défaut (D)" aria-label="Par défaut" onClick={() => onPaint({ fill: null, stroke: '#111111', sw: 2 })} className="rounded px-1 text-xs hover:bg-[var(--bg-hover)]">▣</button>
          <button title="Aucun (/)" aria-label="Aucune couleur" onClick={() => onPaint(active === 'fill' ? { ...paint, fill: null } : { ...paint, stroke: null })} className="rounded px-1 text-xs text-red-500 hover:bg-[var(--bg-hover)]">⁄</button>
        </div>
        <label className="flex items-center gap-1 text-[11px] text-[var(--fg-muted)]" title="Épaisseur du contour (pt)">
          <input type="number" min={0} max={100} step={0.5} value={paint.sw} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onPaint({ ...paint, sw: Math.max(0, v), stroke: paint.stroke ?? '#111111' }) }} className="w-12 rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs text-[var(--fg)] outline-none" aria-label="Épaisseur du contour (pt)" />
          pt
        </label>
      </div>
    </div>
  )
}
