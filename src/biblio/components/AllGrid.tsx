import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { EmptyState, LoadingState } from '@/components/States'
import { ChevronLeft, Images, LayoutGrid, ListChecks, Maximize, Play, Search } from 'lucide-react'
import { formatDuration, layoutMasonry, visibleIndices, type Placed } from '@/biblio/lib/grid.ts'
import { fileUrl, originalPath, thumbPath } from '@/biblio/lib/media.ts'
import type { GridBlock } from '@/biblio/lib/blocks.ts'
import { SIZE_MAX, SIZE_MIN, useGrid } from '@/biblio/store/grid.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import { BlockMenu } from './BlockMenu.tsx'
import { SelectionBar } from './SelectionBar.tsx'
import { CollectionHero } from './CollectionHero.tsx'
import { FilterBar } from './FilterBar.tsx'

const GAP = 12
const OVERSCAN = 600
/** Marge au-dessus de la grille (my-4). */
const GRID_MARGIN = 16
const nf = new Intl.NumberFormat('fr-FR')

interface TileProps {
  block: GridBlock
  place: Placed
  thumbsDir: string
  videoSrc: string | null
  selected: boolean
  onClick: (e: React.MouseEvent, id: string) => void
  onHover: (id: string | null) => void
  onMenu: (x: number, y: number, id: string) => void
}

export const Tile = memo(function Tile({ block, place, thumbsDir, videoSrc, selected, onClick, onHover, onMenu }: TileProps) {
  return (
    <div
      className="absolute cursor-pointer overflow-hidden rounded-xl shadow-[var(--shadow-soft)] transition-[transform,box-shadow] duration-200 hover:z-10 hover:scale-[1.02] hover:shadow-[var(--shadow-lift)]"
      style={{ left: place.x, top: place.y, width: place.w, height: place.h, background: 'var(--bg-hover)', outline: selected ? '3px solid var(--accent)' : 'none', outlineOffset: -3 }}
      onClick={(e) => onClick(e, block.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(e.clientX, e.clientY, block.id)
      }}
      onMouseEnter={() => onHover(block.id)}
      onMouseLeave={() => onHover(null)}
    >
      {block.thumb && <img src={fileUrl(thumbPath(thumbsDir, block.thumb))} alt="" draggable={false} decoding="async" className="h-full w-full object-cover" />}
      {videoSrc && <video src={videoSrc} muted loop autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />}
      {selected && <div className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-xs text-white" style={{ background: 'var(--accent)' }}>✓</div>}
      {block.missing && (
        <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-xs text-white">Fichier introuvable</div>
      )}
      {block.firstKind === 'video' && (
        <div className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
          <Play size={11} fill="currentColor" />
          {block.duration ? formatDuration(block.duration) : null}
        </div>
      )}
      {block.count > 1 && (
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
          <Images size={12} />
          {block.count}
        </div>
      )}
    </div>
  )
})

export function AllGrid({ active, onBack }: { active: boolean; onBack: () => void }) {
  const { blocks, shown, filters, loaded, thumbsDir, size, setSize, open, load, clearFilters } = useGrid()
  const phase = useLibrary((s) => s.phase)
  const root = useLibrary((s) => s.root)
  const scroller = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 800 })
  const [top, setTop] = useState(0)
  const heroRef = useRef<HTMLDivElement>(null)
  const [heroH, setHeroH] = useState(0)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null)
  const selected = useGrid((s) => s.selected)
  const selectBlock = useGrid((s) => s.selectBlock)
  const clearSelection = useGrid((s) => s.clearSelection)
  const organize = useGrid((s) => s.organize)
  const setOrganize = useGrid((s) => s.setOrganize)
  const openId = useGrid((s) => s.openId)

  // Échap vide la sélection (sauf quand la vue détail est ouverte : Échap la ferme).
  useEffect(() => {
    if (selected.size === 0 || openId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected.size, openId, clearSelection])

  // Chargement au démarrage, puis rafraîchissement tant que des miniatures se fabriquent (et une dernière fois à la fin).
  useEffect(() => {
    void load()
    if (phase !== 'thumbs') return
    const timer = setInterval(() => void load(), 8000)
    return () => clearInterval(timer)
  }, [phase, load])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const observer = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const width = Math.max(0, box.w - 32)
  const layout = useMemo(() => layoutMasonry(shown.map((b) => b.ratio), Math.max(width, 1), size, GAP), [shown, width, size])

  // Quand la recherche ou les filtres changent, on repart du haut.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [filters])
  const visible = useMemo(() => (width > 50 ? visibleIndices(layout.items, top - heroH - GRID_MARGIN, box.h, OVERSCAN) : []), [layout, top, box.h, width, heroH])

  // L'en-tête d'une collection défile avec la grille : on mesure sa hauteur pour savoir quelles vignettes sont à l'écran.
  const hasHero = Boolean(filters.collection)
  useEffect(() => {
    const el = heroRef.current
    if (!el) {
      setHeroH(0)
      return
    }
    const observer = new ResizeObserver(() => setHeroH(el.offsetHeight))
    observer.observe(el)
    setHeroH(el.offsetHeight)
    return () => observer.disconnect()
  }, [hasHero])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen().catch(() => undefined)
  }

  const hovered = hoverId ? shown.find((b) => b.id === hoverId) : undefined
  const hoveredVideo = hovered && hovered.firstKind === 'video' && !hovered.missing ? fileUrl(originalPath(root, hovered.rel)) : null

  return (
    <div className="flex h-full flex-col" style={{ display: active ? undefined : 'none' }}>
      <div className="flex items-center gap-4 border-b px-4 py-2.5" style={{ borderColor: 'var(--border)' }}>
        {filters.collection && (
          <button className="btn" onClick={onBack} aria-label="Retour aux collections"><ChevronLeft size={15} /> Collections</button>
        )}
        {!filters.collection && <h1 className="text-base font-semibold">Tout</h1>}
        {!filters.collection && <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>{nf.format(blocks.length)} blocs</span>}
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--fg-muted)' }}>
            Taille
            <input type="range" min={SIZE_MIN} max={SIZE_MAX} step={10} value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Taille des vignettes" />
          </label>
          <button className="btn" onClick={() => setOrganize(!organize)} aria-pressed={organize} style={organize ? { background: 'var(--bg-hover)' } : undefined} title="Sélectionner plusieurs images pour les déplacer, les retirer ou les supprimer"><ListChecks size={15} /> Organiser</button>
          <button className="btn" onClick={toggleFullscreen} title="Plein écran" aria-label="Plein écran"><Maximize size={15} /></button>
        </div>
      </div>

      <FilterBar />
      {organize && (
        <div className="flex items-center gap-3 border-b px-4 py-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-side)' }}>
          <span className="text-sm font-semibold">Sélectionner et réorganiser</span>
          <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>{selected.size === 0 ? 'Clique sur des images pour commencer.' : `${selected.size} sélectionnée${selected.size > 1 ? 's' : ''}`}</span>
          <button className="btn ml-auto" onClick={() => useGrid.setState({ selected: new Set(shown.map((b) => b.id)) })}>Tout sélectionner</button>
          <button className="btn" onClick={() => setOrganize(false)}>Terminé</button>
        </div>
      )}

      <div ref={scroller} className="min-h-0 flex-1 overflow-auto" onScroll={(e) => setTop(e.currentTarget.scrollTop)}>
        {hasHero && (
          <div ref={heroRef}>
            <CollectionHero />
          </div>
        )}
        {!loaded ? (
          <LoadingState label="Ouverture de la bibliothèque…" />
        ) : blocks.length === 0 ? (
          <EmptyState icon={<LayoutGrid size={24} />} title="La bibliothèque est vide" hint="Va dans Réglages &gt; Bibliothèque pour l'indexer, ou télécharge tes enregistrements." />
        ) : loaded && shown.length === 0 && hasHero ? (
          <p className="px-8 py-4 text-sm" style={{ color: 'var(--fg-muted)' }}>Aucune image ici pour l'instant. Fais un clic droit sur une image : « Ajouter à… ».</p>
        ) : loaded && shown.length === 0 ? (
          <EmptyState icon={<Search size={24} />} title="Aucune image ne correspond" hint="Essaie moins de filtres." action={{ label: 'Tout effacer', onClick: clearFilters }} />
        ) : (
          <div className="relative mx-4 my-4" style={{ height: layout.height }}>
            {visible.map((i) => {
              const block = shown[i]
              return (
                <Tile
                  key={block.id}
                  block={block}
                  place={layout.items[i]}
                  thumbsDir={thumbsDir}
                  videoSrc={hoverId === block.id ? hoveredVideo : null}
                  selected={selected.has(block.id)}
                  onClick={(e, id) => {
                    // Ctrl+clic ou Maj+clic : on sélectionne ; quand une sélection existe, un clic simple l'enrichit ; sinon on ouvre.
                    if (e.shiftKey) selectBlock(id, 'range')
                    else if (e.ctrlKey || e.metaKey || organize || selected.size > 0) selectBlock(id, 'toggle')
                    else open(id)
                  }}
                  onHover={setHoverId}
                  onMenu={(x, y, id) => setMenu({ x, y, ids: selected.has(id) ? [...selected] : [id] })}
                />
              )
            })}
          </div>
        )}
      </div>
      {menu && <BlockMenu x={menu.x} y={menu.y} blockIds={menu.ids} onClose={() => setMenu(null)} onDone={clearSelection} />}
      <SelectionBar />
    </div>
  )
}
