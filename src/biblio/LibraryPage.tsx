import { useEffect } from 'react'
import { AllGrid } from '@/biblio/components/AllGrid.tsx'
import { Lightbox } from '@/biblio/components/Lightbox.tsx'
import { useCollections } from '@/biblio/store/collections.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import { useToast } from '@/biblio/store/toast.ts'

/** La page « Tout » de la bibliothèque : toutes les images et vidéos. Reste montée une fois ouverte (on garde la position de défilement). */
export function LibraryPage({ active }: { active: boolean }) {
  const initLibrary = useLibrary((s) => s.init)
  const loadCollections = useCollections((s) => s.load)
  const setFilters = useGrid((s) => s.setFilters)
  useEffect(() => {
    void initLibrary()
    void loadCollections()
  }, [initLibrary, loadCollections])
  return <AllGrid active={active} onBack={() => setFilters({ collection: null })} />
}

/** La vue détail et les petits messages de la bibliothèque : au-dessus de tout, quelle que soit la page. */
export function LibraryOverlays() {
  const { text, action, hide } = useToast()
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
