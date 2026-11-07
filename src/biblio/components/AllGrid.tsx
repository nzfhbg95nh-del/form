import { SplitSlider } from '@/components/SplitSlider'
import { addFiles, addPaths, ALLOWED_EXT } from '@/biblio/lib/ajouts.ts'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { EmptyState, LoadingState } from '@/components/States'
import { Camera, ChevronLeft, Images, LayoutGrid, ListChecks, Maximize, Play, Plus, Search } from 'lucide-react'
import { formatDuration, layoutMasonry, visibleIndices, type Placed } from '@/biblio/lib/grid.ts'
import { fileUrl, originalPath, thumbPath } from '@/biblio/lib/media.ts'
import type { GridBlock } from '@/biblio/lib/blocks.ts'
import { SIZE_MAX, SIZE_MIN, useGrid } from '@/biblio/store/grid.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import { BlockMenu } from './BlockMenu.tsx'
import { SelectionBar } from './SelectionBar.tsx'
import { CollectionHero } from './CollectionHero.tsx'
import { FilterBar } from './FilterBar.tsx'
import { ImageSearchDialog } from './ImageSearchDialog.tsx'
import { isSearchableImage } from '@/biblio/lib/imageSearchPure.ts'

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
      className="absolute cursor-pointer overflow-hidden rounded-xl shadow-[var(--shadow-soft)] after:pointer-events-none after:absolute after:inset-0 after:bg-black/0 after:transition-colors after:duration-200 after:content-[''] hover:after:bg-black/10"
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

/** Une grande zone où déposer des fichiers pendant un glisser : elle fait ce qu'indique son titre. */
function DropZone({ icon, title, hint, onFiles, done }: { icon: React.ReactNode; title: string; hint: string; onFiles: (files: File[]) => void; done: () => void }) {
  const [over, setOver] = useState(false)
  return (
    <div
      className="flex h-64 w-80 flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed text-center"
      style={{ background: over ? 'var(--bg-hover)' : 'var(--bg)', borderColor: over ? 'var(--accent)' : 'var(--border)' }}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        onFiles(Array.from(e.dataTransfer.files))
        done()
      }}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' }}>{icon}</span>
      <span className="px-4 text-base font-semibold">{title}</span>
      <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>{hint}</span>
    </div>
  )
}

export function AllGrid({ active, onBack }: { active: boolean; onBack: () => void }) {
  const { blocks, shown: filteredShown, filters, loaded, thumbsDir, size, setSize, open, load, clearFilters } = useGrid()
  const imageSearch = useGrid((s) => s.imageSearch)
  const searchByImage = useGrid((s) => s.searchByImage)
  const clearImageSearch = useGrid((s) => s.clearImageSearch)
  const [imageDialog, setImageDialog] = useState(false)
  // Une image déposée sur la page : on choisit entre chercher ses semblables et l'ajouter à la bibliothèque.
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  // Garde-fou : les deux zones de dépôt ne doivent jamais rester bloquées. Pendant un vrai glisser, la souris ne produit pas d'événement de déplacement ;
  // dès qu'elle bouge ou qu'on appuie sur une touche ou qu'on clique, c'est que le glisser est fini : on referme.
  useEffect(() => {
    if (!dragging) return
    const stop = () => {
      dragDepth.current = 0
      setDragging(false)
    }
    window.addEventListener('mousemove', stop)
    window.addEventListener('keydown', stop)
    window.addEventListener('pointerdown', stop)
    window.addEventListener('dragend', stop)
    window.addEventListener('drop', stop)
    return () => {
      window.removeEventListener('mousemove', stop)
      window.removeEventListener('keydown', stop)
      window.removeEventListener('pointerdown', stop)
      window.removeEventListener('dragend', stop)
      window.removeEventListener('drop', stop)
    }
  }, [dragging])  // Avec une recherche par image, la grille montre les blocs qui ressemblent à l'image (du plus ressemblant au moins ressemblant), à la place du résultat des filtres.
  const shown = useMemo(() => {
    if (imageSearch?.ids === null) return []
    if (!imageSearch) return filteredShown
    const byId = new Map(blocks.map((b) => [b.id, b]))
    return imageSearch.ids.map((id) => byId.get(id)).filter((b): b is (typeof blocks)[number] => !!b)
  }, [imageSearch, filteredShown, blocks])
  const phase = useLibrary((s) => s.phase)
  const root = useLibrary((s) => s.root)
  const scroller = useRef<HTMLDivElement>(null)
  const [addMenu, setAddMenu] = useState(false)
  const pickFiles = async () => {
    const picked = await openDialog({ multiple: true, filters: [{ name: 'Images et vidéos', extensions: [...ALLOWED_EXT] }] }).catch(() => null)
    if (picked) await addPaths(Array.isArray(picked) ? picked : [picked])
  }
  const pickFolder = async () => {
    const picked = await openDialog({ directory: true }).catch(() => null)
    if (picked) await addPaths([picked as string])
  }
  // Ctrl+V : une image copiée (web, capture d'écran) est ajoutée à la bibliothèque.
  useEffect(() => {
    if (!active) return
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
      if (files.length === 0) return
      e.preventDefault()
      void addFiles(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [active])
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
    <div
      className="flex h-full flex-col"
      style={{ display: active ? undefined : 'none' }}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        dragDepth.current++
        setDragging(true)
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDrop={() => {
        // Tout dépôt, où qu'il ait lieu, referme les deux zones.
        dragDepth.current = 0
        setDragging(false)
      }}
    >
      <div className="flex items-center gap-4 border-b px-6 py-2.5" style={{ borderColor: 'var(--border)' }}>
        {filters.collection && (
          <button className="btn" onClick={onBack} aria-label="Retour aux collections"><ChevronLeft size={15} /> Collections</button>
        )}
        {!filters.collection && (
          <div className="flex items-baseline gap-3">
            <h1 className="text-base font-semibold">Tout</h1>
            <span className="lib-count">{nf.format(blocks.length)} blocs</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          <SplitSlider className="w-64" min={SIZE_MIN} max={SIZE_MAX} step={10} value={size} onChange={setSize} label="Taille" right={`${size} px`} ariaLabel="Taille des vignettes" />
          <button className="btn h-9" onClick={() => setOrganize(!organize)} aria-pressed={organize} style={organize ? { background: 'var(--bg-hover)' } : undefined} title="Sélectionner plusieurs images pour les déplacer, les retirer ou les supprimer"><ListChecks size={15} /> Organiser</button>
          <div className="relative">
            <button className="btn btn-primary h-9" onClick={() => setAddMenu((v) => !v)} aria-haspopup="menu" aria-expanded={addMenu} title="Ajouter des images à la bibliothèque (ou glisse-les ici, ou Ctrl+V)">
              <Plus size={15} /> Ajouter
            </button>
            {addMenu && (
              <>
                <div className="fixed inset-0 z-40" onPointerDown={() => setAddMenu(false)} />
                <div role="menu" className="absolute right-0 top-11 z-50 w-56 rounded-xl border p-1.5 shadow-lg" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
                  <button role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--bg-hover)]" onClick={() => { setAddMenu(false); void pickFiles() }}>Choisir des images…</button>
                  <button role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--bg-hover)]" onClick={() => { setAddMenu(false); void pickFolder() }}>Choisir un dossier…</button>
                </div>
              </>
            )}
          </div>
          <button className="btn h-9" onClick={toggleFullscreen} title="Plein écran" aria-label="Plein écran"><Maximize size={15} /></button>
        </div>
      </div>

      <FilterBar onImageSearch={() => setImageDialog(true)} onCloseCollection={onBack} />
      {imageSearch && (
        <div className="flex items-center gap-3 border-b px-4 py-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-side)' }}>
          <img src={imageSearch.preview} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" draggable={false} />
          <div className="min-w-0 flex-1 text-sm">
            {imageSearch.ids === null ? (
              'Recherche des images semblables…'
            ) : imageSearch.error ? (
              <span style={{ color: '#d44c47' }}>{imageSearch.error}</span>
            ) : (
              <span><b>{nf.format(imageSearch.ids.length)}</b> images semblables à celle que tu as donnée, de la plus ressemblante à la moins ressemblante.</span>
            )}
          </div>
          <button className="btn" onClick={() => setImageDialog(true)}>Autre image</button>
          <button className="btn" onClick={clearImageSearch}>Effacer la recherche</button>
        </div>
      )}
      {imageDialog && <ImageSearchDialog onPick={(file) => void searchByImage(file)} onClose={() => setImageDialog(false)} />}      {organize && (
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
        {!loaded || imageSearch?.ids === null ? (
          <LoadingState label={imageSearch?.ids === null ? 'Recherche des images semblables…' : 'Ouverture de la bibliothèque…'} />
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
      {dragging && (
        <div className="fixed inset-0 z-40 flex items-center justify-center gap-6 bg-black/45 p-10">
          <DropZone
            icon={<Camera size={30} />}
            title="Chercher les images semblables"
            hint="Dépose l'image ici"
            onFiles={(files) => {
              const image = files.find(isSearchableImage)
              if (image) void searchByImage(image)
            }}
            done={() => { dragDepth.current = 0; setDragging(false) }}
          />
          <DropZone icon={<Plus size={30} />} title="Ajouter à la bibliothèque" hint="Dépose les images ici" onFiles={(files) => void addFiles(files)} done={() => { dragDepth.current = 0; setDragging(false) }} />
        </div>
      )}    </div>
  )
}
