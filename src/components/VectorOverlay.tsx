import type { VcOverlay } from '@/lib/vectorEngine'

const rgb = (c: number[]) => `rgb(${c[0] ?? 0}, ${c[1] ?? 0}, ${c[2] ?? 0})`
const rgba = (c: number[]) => `rgba(${c[0] ?? 0}, ${c[1] ?? 0}, ${c[2] ?? 0}, ${(c[3] ?? 255) / 255})`

/**
 * Ce que le moteur de dessin demande de poser par-dessus la toile : le tracé en cours, les points d'ancrage (pleins s'ils sont choisis),
 * les poignées, les repères (« anchor », « handle »), le rectangle de sélection… Les coordonnées sont celles de la toile ;
 * les tailles (points, traits, textes) sont en pixels d'écran, donc divisées par le zoom.
 */
export function VectorOverlay({ overlays, zoom }: { overlays: VcOverlay[]; zoom: number }) {
  const k = 1 / zoom
  return (
    <svg style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none' }}>
      {overlays.map((o, i) => {
        switch (o.t) {
          case 'marquee':
            return <rect key={i} x={Math.min(o.x0, o.x1)} y={Math.min(o.y0, o.y1)} width={Math.abs(o.x1 - o.x0)} height={Math.abs(o.y1 - o.y0)} fill="rgba(77,163,255,0.12)" stroke="#4da3ff" strokeWidth={k} />
          case 'path':
            return <path key={i} d={o.d} fill="none" stroke={rgb(o.color)} strokeWidth={Math.max(1, o.width) * k} strokeDasharray={o.dashed ? `${4 * k} ${3 * k}` : undefined} />
          case 'line':
          case 'gridLine':
            return <line key={i} x1={o.a[0]} y1={o.a[1]} x2={o.b[0]} y2={o.b[1]} stroke={o.t === 'line' ? rgb(o.color) : rgba(o.color)} strokeWidth={k} strokeDasharray={o.t === 'line' && o.dashed ? `${4 * k} ${3 * k}` : undefined} />
          case 'anchor': {
            const s = Math.max(5, o.size) * k
            return <rect key={i} x={o.p[0] - s / 2} y={o.p[1] - s / 2} width={s} height={s} fill={o.filled ? rgb(o.color) : '#fff'} stroke={rgb(o.color)} strokeWidth={k} />
          }
          case 'curvePoint': {
            const s = Math.max(5, o.size) * k
            return <circle key={i} cx={o.p[0]} cy={o.p[1]} r={s / 2} fill={o.filled ? rgb(o.color) : '#fff'} stroke={rgb(o.color)} strokeWidth={k} />
          }
          case 'handle':
            return <circle key={i} cx={o.p[0]} cy={o.p[1]} r={3.5 * k} fill={rgb(o.color)} />
          case 'label':
            return <text key={i} x={o.p[0] + 6 * k} y={o.p[1] - 6 * k} fontSize={12 * k} fill={rgb(o.color)} style={{ fontFamily: 'sans-serif' }}>{o.text}</text>
          case 'measure':
            return (
              <g key={i} transform={`translate(${o.p[0]} ${o.p[1]}) scale(${k})`}>
                <rect x={0} y={0} width={Math.max(40, o.text.length * 6.5 + 12)} height={20} rx={4} fill="rgba(60,60,60,0.9)" />
                <text x={6} y={14} fontSize={11} fill="#fff" style={{ fontFamily: 'sans-serif' }}>{o.text}</text>
              </g>
            )
          case 'distance':
            return (
              <g key={i} stroke={rgb(o.color)} strokeWidth={k}>
                <line x1={o.a[0]} y1={o.a[1]} x2={o.b[0]} y2={o.b[1]} />
                <text x={(o.a[0] + o.b[0]) / 2} y={(o.a[1] + o.b[1]) / 2 - 4 * k} fontSize={11 * k} fill={rgb(o.color)} stroke="none">{o.text}</text>
              </g>
            )
          case 'highlight':
            return <polygon key={i} points={o.quad.map((q) => q.join(',')).join(' ')} fill={rgba(o.color)} />
          case 'cornerWidget':
            return (
              <g key={i}>
                <circle cx={o.p[0]} cy={o.p[1]} r={3 * k} fill="#fff" stroke={rgb(o.color)} strokeWidth={k} />
                <circle cx={o.p[0]} cy={o.p[1]} r={k} fill={rgb(o.color)} />
              </g>
            )
          case 'swatch':
            return <circle key={i} cx={o.p[0]} cy={o.p[1]} r={5 * k} fill={rgba(o.color)} stroke={o.selected ? '#4da3ff' : '#888'} strokeWidth={1.5 * k} />
          default:
            return null
        }
      })}
    </svg>
  )
}

// Les curseurs : l'icône de l'outil (celle de la barre) cernée de blanc pour se voir sur toute couleur, avec une petite marque pour l'action
// (nouveau tracé, ajout, retrait, fermeture…). Ils sont fabriqués une fois et gardés, pour ne pas clignoter quand on passe de l'un à l'autre.
const ICONS = import.meta.glob('../assets/vc-icons/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const inner = (name: string) => (ICONS[`../assets/vc-icons/${name}.svg`] ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '')

/** [icône, marque, point actif en pixels (la pointe de l'outil)] */
const CURSORS: Record<string, [string, string, [number, number]]> = {
  Pen: ['pen-tool', '*', [3, 3]],
  PenDrawing: ['pen-tool', '', [3, 3]],
  PenAdd: ['pen-tool-add', '', [3, 3]],
  PenDelete: ['pen-tool-delete', '', [3, 3]],
  PenClose: ['pen-tool', 'o', [3, 3]],
  PenContinue: ['pen-tool', '/', [3, 3]],
  PenJoin: ['pen-tool', '+', [3, 3]],
  PenConvert: ['dc-anchor', '', [16, 5]],
  AnchorPoint: ['dc-anchor', '', [16, 5]],
  Curvature: ['spline', '', [3, 3]],
  Pencil: ['pencil', '', [4, 28]],
  PathEraser: ['dc-path-eraser', '', [16, 16]],
  Smooth: ['dc-smooth', '', [16, 16]],
  Join: ['dc-join', '', [16, 16]],
}
const cache = new Map<string, string>()

/** La forme du curseur d'un outil du moteur : un curseur de l'écran, ou l'icône de l'outil avec la marque de l'action. */
export function vectorCursor(name: string): string {
  const hit = cache.get(name)
  if (hit) return hit
  const spec = CURSORS[name]
  let css: string
  if (spec && inner(spec[0])) {
    const body = inner(spec[0])
    const badge = spec[1] ? `<text x='15' y='23' font-size='11' font-family='sans-serif' font-weight='bold' fill='black' stroke='white' stroke-width='2.5' paint-order='stroke'>${spec[1]}</text>` : ''
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'><g stroke='white' stroke-width='4.2'>${body}</g><g stroke='black' stroke-width='1.8'>${body}</g>${badge}</svg>`
    css = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${spec[2][0]} ${spec[2][1]}, crosshair`
  } else {
    css = ({ ArrowHollow: 'default', DirectAnchor: 'default', DirectAnchorSelected: 'default', ReshapeSegment: 'default', GroupSelection: 'default', SelectionCopy: 'copy', Move: 'move', Crosshair: 'crosshair', ResizeH: 'ew-resize', ResizeV: 'ns-resize', ResizeNwSe: 'nwse-resize', ResizeNeSw: 'nesw-resize' } as Record<string, string>)[name] ?? 'default'
  }
  cache.set(name, css)
  return css
}
