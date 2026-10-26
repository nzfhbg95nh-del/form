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
          case 'swatch':
            return <circle key={i} cx={o.p[0]} cy={o.p[1]} r={5 * k} fill={rgba(o.color)} stroke={o.selected ? '#4da3ff' : '#888'} strokeWidth={1.5 * k} />
          default:
            return null
        }
      })}
    </svg>
  )
}

/** La forme du curseur d'un outil du moteur : un curseur de l'écran, ou une petite plume avec la marque de l'action. */
export function vectorCursor(name: string): string {
  const pen = (badge: string) => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M4 4 L16 14 L14 26 L8 20 Z' fill='white' stroke='black' stroke-width='1.5' stroke-linejoin='round'/><text x='19' y='28' font-size='14' font-family='sans-serif' font-weight='bold' fill='black' stroke='white' stroke-width='2.5' paint-order='stroke'>${badge}</text></svg>`
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 4 4, crosshair`
  }
  const arrow = (hollow: boolean, badge: string) => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M4 3 L4 22 L9 17 L13 26 L16 25 L12 16 L19 16 Z' fill='${hollow ? 'white' : 'black'}' stroke='${hollow ? 'black' : 'white'}' stroke-width='1.3' stroke-linejoin='round'/><text x='18' y='28' font-size='13' font-family='sans-serif' font-weight='bold' fill='black' stroke='white' stroke-width='2.5' paint-order='stroke'>${badge}</text></svg>`
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 4 3, default`
  }
  switch (name) {
    case 'Pen': return pen('*')
    case 'PenDrawing': return pen('')
    case 'PenAdd': return pen('+')
    case 'PenDelete': return pen('−')
    case 'PenClose': return pen('o')
    case 'PenContinue': return pen('/')
    case 'PenJoin': return pen('∪')
    case 'AnchorPoint': return pen('^')
    case 'ArrowHollow': return arrow(true, '')
    case 'DirectAnchor': return arrow(true, '▫')
    case 'DirectAnchorSelected': return arrow(true, '▪')
    case 'ReshapeSegment': return arrow(true, '~')
    case 'GroupSelection': return arrow(true, '+')
    case 'SelectionCopy': return arrow(false, '+')
    case 'Move': return 'move'
    case 'Crosshair': return 'crosshair'
    case 'ResizeH': return 'ew-resize'
    case 'ResizeV': return 'ns-resize'
    case 'ResizeNwSe': return 'nwse-resize'
    case 'ResizeNeSw': return 'nesw-resize'
    default: return name.startsWith('Pencil') || name.startsWith('Path') || name === 'Join' || name === 'Smooth' ? 'crosshair' : 'default'
  }
}
