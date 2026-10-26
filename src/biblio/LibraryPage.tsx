import { useEffect, useState } from 'react'
import { AllGrid } from '@/biblio/components/AllGrid.tsx'
import { CollectionsView } from '@/biblio/components/CollectionsView.tsx'
import { Lightbox } from '@/biblio/components/Lightbox.tsx'
import { MapView } from '@/biblio/components/MapView.tsx'
import { MoodboardsView } from '@/biblio/components/MoodboardsView.tsx'
import { openTarget } from '@/biblio/lib/collections.ts'
import { useCollections } from '@/biblio/store/collections.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import { useMapRequest } from '@/biblio/store/map.ts'
import { useLibraryNav } from '@/biblio/store/nav.ts'
import { useToast } from '@/biblio/store/toast.ts'
import { useApp } from '@/store/app'

/**
 * Les pages de la bibliothèque (Tout, Collections, Moodboards, Carte). Chacune se monte à sa première ouverture, puis reste en place :
 * on retrouve la position de défilement et l'endroit où on était sur la Carte.
 */
export function LibraryPage({ active }: { active: boolean }) {
  const page = useLibraryNav((s) => s.page)
  const go = useLibraryNav((s) => s.go)
  const initLibrary = useLibrary((s) => s.init)
  const loadCollections = useCollections((s) => s.load)
  const cards = useCollections((s) => s.cards)
  const { filters, setFilters } = useGrid()
  const [opened, setOpened] = useState<Set<string>>(new Set())

  useEffect(() => {
    void initLibrary()
    void loadCollections()
  }, [initLibrary, loadCollections])

  useEffect(() => {
    if (!active) return
    setOpened((o) => (o.has(page) ? o : new Set(o).add(page)))
  }, [active, page])

  const show = (id: string, element: React.ReactNode) => opened.has(id) && <div className="h-full" hidden={!active || page !== id}>{element}</div>

  return (
    <div className="h-full">
      {show('all', (
        <AllGrid
          active={active && page === 'all'}
          onBack={() => {
            // Dans un sous-tableau, on remonte au tableau ; sinon on revient à la page Collections.
            const parent = filters.collection?.parentId ? cards.find((c) => c.id === filters.collection?.parentId) : undefined
            if (parent) {
              setFilters({ collection: openTarget(parent) })
              return
            }
            setFilters({ collection: null })
            go('collections')
          }}
        />
      ))}
      {show('collections', (
        <CollectionsView
          onOpen={(c) => {
            setFilters({ collection: openTarget(c) })
            go('all')
          }}
        />
      ))}
      {show('moodboards', <MoodboardsView />)}
      {show('map', <MapView />)}
    </div>
  )
}

/** La vue détail, les petits messages et « Voir sur la carte » : au-dessus de tout, quelle que soit la page de Form. */
export function LibraryOverlays() {
  const { text, action, hide } = useToast()
  const mapRequest = useMapRequest((s) => s.request)
  // « Voir sur la carte » (vue détail, tableau) : on ferme la vue détail et on ouvre la Carte.
  useEffect(() => {
    if (mapRequest === 0) return
    useGrid.getState().open(null)
    useLibraryNav.getState().go('map')
    useApp.getState().show('library')
  }, [mapRequest])
  return (
    <>
      <Lightbox />
      {text && (
        <div className="fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-4 rounded-lg px-4 py-2 text-sm shadow-lg" style={{ background: 'var(--fg)', color: 'var(--bg)' }} role="status">
          <span>{text}</span>
          {action && (
            <button className="font-semibold underline" onClick={() => { hide(); action.run() }}>{action.label}</button>
          )}
        </div>
      )}
    </>
  )
}
