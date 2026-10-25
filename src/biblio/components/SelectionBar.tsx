import { useState } from 'react'
import { ArrowRightLeft, FolderMinus, Plus, Trash2, X } from 'lucide-react'
import { useCollections } from '@/biblio/store/collections.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { useTrash } from '@/biblio/store/trash.ts'
import { BlockMenu } from './BlockMenu.tsx'

/** La barre qui apparaît quand des blocs sont sélectionnés dans la grille : les ranger, les déplacer, les retirer, les mettre à la corbeille. */
export function SelectionBar() {
  const selected = useGrid((s) => s.selected)
  const clear = useGrid((s) => s.clearSelection)
  const open = useGrid((s) => s.filters.collection)
  const cards = useCollections((s) => s.cards)
  const removeBlock = useCollections((s) => s.removeBlock)
  const trash = useTrash((s) => s.trash)
  const [menu, setMenu] = useState<{ x: number; y: number; move: boolean } | null>(null)
  if (selected.size === 0) return null
  const n = selected.size
  const ids = [...selected]
  // « Déplacer » et « Retirer » n'ont de sens que dans une de mes collections.
  const fromMine = open && cards.find((c) => c.id === open.id)?.kind === 'manual' ? open : null
  const popAt = (e: React.MouseEvent, move: boolean) => {
    const r = e.currentTarget.getBoundingClientRect()
    setMenu({ x: r.left, y: r.top - 520, move })
  }
  return (
    <>
      <div
        className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 shadow-lg"
        style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
        role="toolbar"
        aria-label="Sélection"
      >
        <span className="mr-1 text-sm font-medium">{n} sélectionnée{n > 1 ? 's' : ''}</span>
        <button className="btn" onClick={(e) => popAt(e, false)}><Plus size={15} /> Ajouter à…</button>
        {fromMine && <button className="btn" onClick={(e) => popAt(e, true)}><ArrowRightLeft size={15} /> Déplacer vers…</button>}
        {fromMine && (
          <button className="btn" onClick={() => void Promise.all(ids.map((id) => removeBlock(fromMine.id, id))).then(clear)}>
            <FolderMinus size={15} /> Retirer du tableau
          </button>
        )}
        <button className="btn" onClick={() => void trash(ids)} title="Elles disparaissent de la bibliothèque ; tu peux les restaurer depuis Réglages → Bibliothèque → Corbeille"><Trash2 size={15} /> Corbeille</button>
        <button className="btn" onClick={clear} aria-label="Tout désélectionner"><X size={15} /> Annuler</button>
      </div>
      {menu && <BlockMenu x={menu.x} y={Math.max(8, menu.y)} blockIds={ids} moveFrom={menu.move ? fromMine?.id : undefined} onClose={() => setMenu(null)} onDone={clear} />}
    </>
  )
}
