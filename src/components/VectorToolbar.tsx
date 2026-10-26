import { useEffect, useRef, useState } from 'react'
import { TOOL_GROUPS, type ToolInfo } from '@/lib/vectorTools'
import { DEFAULT_PAINT, type PaintStyle } from '@/lib/vectorEngine'

// Les icônes de VectorCraft (Lucide, ISC, et les siennes, MIT ou Apache-2.0) : des SVG qu'on dessine dans la couleur du texte.
const RAW = import.meta.glob('../assets/vc-icons/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const iconSource = (name: string) => RAW[`../assets/vc-icons/${name}.svg`] ?? RAW['../assets/vc-icons/square-dashed.svg'] ?? ''

/** Un outil du moteur, ou un des nôtres qui prend sa place dans la barre. */
export interface BarTool extends ToolInfo {
  /** L'identifiant de l'outil dans Form (le moteur : le même que le sien ; sinon select / text / hand). */
  tool: string
}

/**
 * Les groupes de la barre, dans l'ordre de celle d'Illustrator (deux colonnes, de gauche à droite puis ligne par ligne) :
 * Sélection, Sélection directe / Baguette magique, Lasso / Plume, Courbure / Texte, Trait / Forme, Pinceau / Crayon, Gomme / Rotation, Échelle / …
 */
const GROUP_FIRST = ['selection', 'directSelection', 'magicWand', 'lasso', 'pen', 'curvature', 'type', 'lineSegment', 'rectangle', 'paintbrush', 'shaper', 'eraser', 'rotate', 'scale', 'eyedropper', 'hand']
const OURS: Record<string, string> = { selection: 'select', type: 'text', areaType: 'text', hand: 'hand' }
const HIDDEN = new Set(['typeOnPath', 'verticalType', 'verticalAreaType', 'verticalTypeOnPath', 'touchType', 'puppetWarp', 'livePaintBucket', 'livePaintSelection', 'freeTransform', 'shapeBuilder'])

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

function ToolIcon({ svg, size = 20 }: { svg: string; size?: number }) {
  // Les flèches de sélection ont un fond noir (pleine) ou blanc (directe), quel que soit le thème.
  const fill = svg === 'dc-selection' ? '#000' : svg === 'dc-direct' ? '#fff' : null
  return (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      {fill && <span aria-hidden className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full" style={{ color: fill, fill }} dangerouslySetInnerHTML={{ __html: iconSource('dc-arrow-fill') }} />}
      <span aria-hidden className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full [&>svg]:[stroke-width:1.5]" dangerouslySetInnerHTML={{ __html: iconSource(svg) }} />
    </span>
  )
}

// Le style de Form : les couleurs du thème (clair ou sombre), comme les autres panneaux du moodboard.
const PANEL = 'var(--bg)'
const PANEL_EDGE = 'var(--border)'
const ICON = 'var(--fg)'
const HOVER = 'var(--bg-hover)'
const ACTIVE = 'var(--bg)'

/**
 * La barre d'outils du moodboard, à la manière de celle d'Illustrator : un panneau gris à deux colonnes, un bouton par groupe qui montre le dernier outil
 * choisi du groupe (petit triangle dans le coin) ; un appui long (ou un clic droit) ouvre la liste des outils du groupe, avec leur raccourci.
 * En bas : remplissage et contour, couleur / dégradé / aucun.
 */
export function VectorToolbar({ tool, onTool, paint, onPaint }: { tool: string; onTool: (t: string) => void; paint: PaintStyle; onPaint: (p: PaintStyle) => void }) {
  const [chosen, setChosen] = useState<Record<number, string>>({})
  // La liste d'un groupe : sa position à l'écran (la barre défile, la liste ne doit pas être coupée par elle).
  const [open, setOpen] = useState<{ i: number; x: number; y: number } | null>(null)
  // La liste s'ouvre juste à côté de la barre (pas sur sa deuxième colonne), à la hauteur du bouton.
  const openAt = (i: number, el: HTMLElement) => { const r = el.getBoundingClientRect(); const bar = boxRef.current?.getBoundingClientRect(); setOpen({ i, x: (bar?.right ?? r.right) + 6, y: r.top }) }
  const timer = useRef<number | undefined>(undefined)
  const fired = useRef(false)
  const [active, setActive] = useState<'fill' | 'stroke'>('fill')
  const [single, setSingle] = useState(false)
  const [hidden, setHidden] = useState(false)
  // Position de la barre sur la toile : on la déplace en tirant la poignée (les petits points du haut) ; elle est retenue d'une fois sur l'autre.
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('form-vc-toolbar') ?? 'null')
      if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) return v
    } catch { /* sans importance */ }
    return { x: 12, y: 56 }
  })
  const posRef = useRef(pos)
  posRef.current = pos
  const boxRef = useRef<HTMLDivElement>(null)
  const startMove = (e: React.PointerEvent<HTMLElement>) => {
    const box = boxRef.current
    const area = box?.offsetParent as HTMLElement | null
    if (!box || !area) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const start = { px: e.clientX, py: e.clientY, x: posRef.current.x, y: posRef.current.y }
    const move = (ev: PointerEvent) => {
      const maxX = Math.max(0, area.clientWidth - 40)
      const maxY = Math.max(0, area.clientHeight - 40)
      setPos({ x: Math.min(maxX, Math.max(0, start.x + ev.clientX - start.px)), y: Math.min(maxY, Math.max(0, start.y + ev.clientY - start.py)) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      try { localStorage.setItem('form-vc-toolbar', JSON.stringify(posRef.current)) } catch { /* sans importance */ }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const fillInput = useRef<HTMLInputElement>(null)
  const strokeInput = useRef<HTMLInputElement>(null)

  // L'outil choisi ailleurs (une touche) devient celui que son groupe montre.
  useEffect(() => {
    BAR_GROUPS.forEach((g, i) => { if (g.some((t) => t.tool === tool)) setChosen((c) => (g.find((t) => t.tool === tool && c[i] === t.id) ? c : { ...c, [i]: g.find((t) => t.tool === tool)!.id })) })
  }, [tool])

  const shown = (g: BarTool[], i: number) => g.find((t) => t.id === chosen[i]) ?? g[0]
  const isActive = (g: BarTool[]) => g.some((t) => t.tool === tool)
  const swap = () => onPaint({ ...paint, fill: paint.stroke, stroke: paint.fill ?? paint.stroke })

  if (hidden) {
    return (
      <button data-ui title="Afficher la barre d'outils" aria-label="Afficher la barre d'outils" onClick={() => setHidden(false)} className="absolute z-30 rounded border px-2 py-1 text-xs shadow-sm" style={{ left: pos.x, top: pos.y, background: PANEL, color: ICON, borderColor: PANEL_EDGE }}>
        »
      </button>
    )
  }

  return (
    <div ref={boxRef} data-ui data-scroll className="absolute z-30 flex max-h-[calc(100%-100px)] flex-col overflow-hidden rounded-2xl shadow-[var(--shadow-lift)]" style={{ left: pos.x, top: pos.y, background: 'var(--bg-side)', border: `1px solid ${PANEL_EDGE}`, color: ICON, width: single ? 44 : 80 }}>
      {/* En-tête : replier (deux colonnes ↔ une colonne), masquer, poignée */}
      <div className="flex items-center justify-between px-1.5 pt-1 text-[11px] text-[var(--fg-muted)]" style={{ background: 'var(--bg-side)' }}>
        <button title={single ? 'Deux colonnes' : 'Une colonne'} aria-label={single ? 'Deux colonnes' : 'Une colonne'} onClick={() => setSingle(!single)} className="rounded px-0.5 hover:bg-[var(--bg-hover)]">{single ? '»' : '«'}</button>
        {!single && <button title="Masquer la barre d'outils" aria-label="Masquer la barre d'outils" onClick={() => setHidden(true)} className="rounded px-0.5 hover:bg-[var(--bg-hover)]">✕</button>}
      </div>
      {/* La poignée : tirer ces petits points déplace la barre */}
      <div role="separator" aria-label="Déplacer la barre d'outils" title="Tire pour déplacer la barre d'outils" onPointerDown={startMove} className="group mx-auto flex h-4 w-[calc(100%-14px)] cursor-grab touch-none items-center justify-center active:cursor-grabbing">
        <span className="h-1 w-8 rounded-full bg-[var(--border)] transition-colors group-hover:bg-[var(--fg-muted)]" />
      </div>

      <div data-scroll className={'grid min-h-0 flex-1 gap-[2px] overflow-y-auto overflow-x-hidden p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ' + (single ? 'grid-cols-1' : 'grid-cols-2')} style={{ alignContent: 'start' }}>
        {BAR_GROUPS.map((g, i) => {
          const t = shown(g, i)
          return (
            <div key={g[0].id} className="relative">
              <button
                title={`${t.label}${t.shortcut ? ` (${t.shortcut})` : ''}`}
                aria-label={t.label}
                aria-pressed={isActive(g)}
                onPointerDown={g.length > 1 ? (e) => {
                  fired.current = false
                  window.clearTimeout(timer.current)
                  const el = e.currentTarget
                  timer.current = window.setTimeout(() => { fired.current = true; openAt(i, el) }, 400)
                } : undefined}
                onPointerUp={() => window.clearTimeout(timer.current)}
                onPointerLeave={() => window.clearTimeout(timer.current)}
                onContextMenu={g.length > 1 ? (e) => { e.preventDefault(); openAt(i, e.currentTarget) } : undefined}
                onClick={() => { if (fired.current) { fired.current = false; return } onTool(t.tool) }}
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ background: isActive(g) ? ACTIVE : 'transparent', color: isActive(g) ? 'var(--accent)' : ICON, boxShadow: isActive(g) ? 'var(--shadow-soft)' : undefined }}
                onMouseEnter={(e) => { if (!isActive(g)) e.currentTarget.style.background = HOVER }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isActive(g) ? ACTIVE : 'transparent' }}
              >
                <ToolIcon svg={t.svg} />
              </button>
              {g.length > 1 && <span aria-hidden className="pointer-events-none absolute bottom-[3px] right-[3px] h-0 w-0 border-b-[5px] border-l-[5px] border-l-transparent" style={{ borderBottomColor: ICON, opacity: 0.8 }} />}
              {open?.i === i && (
                <>
                  <div className="fixed inset-0 z-[60]" onPointerDown={() => setOpen(null)} />
                  <div role="menu" style={{ left: open.x, top: open.y, background: 'var(--bg)', color: ICON, border: `1px solid ${PANEL_EDGE}` }} className="fixed z-[70] flex min-w-72 flex-col rounded-xl p-1.5 shadow-xl">
                    {g.map((x) => (
                      <button
                        key={x.id}
                        role="menuitem"
                        className="flex items-center gap-3 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)]"
                        style={x.id === t.id ? { color: 'var(--accent)' } : undefined}
                        onClick={() => { setOpen(null); setChosen((c) => ({ ...c, [i]: x.id })); onTool(x.tool) }}
                      >
                        <span className="flex w-2 justify-center text-[8px]">{x.id === t.id ? '■' : ''}</span>
                        <ToolIcon svg={x.svg} size={18} />
                        <span className="flex-1">{x.label}</span>
                        {x.shortcut && <span className="text-xs opacity-70">({x.shortcut})</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Remplissage et contour, comme dans la barre d'Illustrator */}
      <div className="flex shrink-0 flex-col items-center gap-1.5 px-1 pb-2 pt-1" style={{ borderTop: `1px solid ${PANEL_EDGE}` }}>
        <div className="relative" style={{ width: single ? 36 : 70, height: single ? 38 : 66 }}>
          <button
            title="Contour (X pour passer du remplissage au contour)"
            aria-label="Couleur du contour"
            onClick={() => { setActive('stroke'); strokeInput.current?.click() }}
            className="absolute bottom-0 right-0 h-[40px] w-[40px]"
            style={{ background: paint.stroke ?? '#fff', border: `${active === 'stroke' ? 2 : 1}px solid ${active === 'stroke' ? 'var(--accent)' : 'var(--border)'}`, zIndex: active === 'stroke' ? 2 : 1 }}
          >
            <span className="absolute inset-[9px]" style={{ background: PANEL, border: '1px solid var(--border)' }} />
            {paint.stroke === null && <span aria-hidden className="absolute inset-0 overflow-hidden"><span className="absolute left-0 top-1/2 h-[2px] w-[150%] origin-left -rotate-45 bg-red-600" /></span>}
          </button>
          <button
            title="Remplissage"
            aria-label="Couleur de remplissage"
            onClick={() => { setActive('fill'); fillInput.current?.click() }}
            className="absolute left-0 top-0 h-[40px] w-[40px]"
            style={{ background: paint.fill ?? '#fff', border: `${active === 'fill' ? 2 : 1}px solid ${active === 'fill' ? 'var(--accent)' : 'var(--border)'}`, zIndex: active === 'fill' ? 2 : 1 }}
          >
            {paint.fill === null && <span aria-hidden className="absolute inset-0 overflow-hidden"><span className="absolute left-0 top-1/2 h-[2px] w-[150%] origin-left -rotate-45 bg-red-600" /></span>}
          </button>
          <button title="Permuter le remplissage et le contour (Maj+X)" aria-label="Permuter" onClick={swap} className="absolute -right-1 -top-1 text-sm leading-none hover:text-white">↷</button>
          <button title="Remplissage et contour par défaut (D)" aria-label="Par défaut" onClick={() => onPaint(DEFAULT_PAINT)} className="absolute -bottom-1 -left-1 h-3 w-3 border border-[var(--border)] bg-white text-[0px]" style={{ outline: '2px solid #000', outlineOffset: -4 }}>d</button>
          <input ref={fillInput} type="color" className="sr-only" tabIndex={-1} value={paint.fill ?? '#ffffff'} onChange={(e) => onPaint({ ...paint, fill: e.target.value })} aria-hidden />
          <input ref={strokeInput} type="color" className="sr-only" tabIndex={-1} value={paint.stroke ?? '#000000'} onChange={(e) => onPaint({ ...paint, stroke: e.target.value, sw: paint.sw > 0 ? paint.sw : 1 })} aria-hidden />
        </div>
        <label className="flex items-center gap-1 text-[11px] opacity-80" title="Épaisseur du contour (pt)">
          <input type="number" min={0} max={100} step={0.5} value={paint.sw} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onPaint({ ...paint, sw: Math.max(0, v), stroke: paint.stroke ?? '#000000' }) }} className="w-10 rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs outline-none focus:border-[var(--accent)]" style={{ color: ICON }} aria-label="Épaisseur du contour (pt)" />
          pt
        </label>
      </div>
    </div>
  )
}
