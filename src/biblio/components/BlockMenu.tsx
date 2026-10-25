import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { FEATURES } from '@/biblio/flags.ts'
import { refOf } from '@/biblio/lib/moodboards.ts'
import { useCollections } from '@/biblio/store/collections.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { useMoodboards } from '@/biblio/store/moodboards.ts'
import { useTrash } from '@/biblio/store/trash.ts'
import { CollectionPicker } from './CollectionPicker.tsx'
import { NameInput } from './NameInput.tsx'

const head = 'px-2 py-1 text-xs font-medium uppercase tracking-wide'
const item = 'block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)]'
const entry = 'flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-[var(--bg-hover)]'

/**
 * Menu du clic droit sur un bloc (ou sur la sélection) : le ranger dans une de mes collections (choix façon Pinterest), l'ajouter à un moodboard,
 * le mettre à la corbeille. `moveFrom` : on déplace depuis cette collection (les blocs y sont retirés une fois rangés ailleurs).
 * `onDone` : appelé après une action réussie (par exemple pour vider la sélection).
 */
export function BlockMenu({ x, y, blockIds, moveFrom, onClose, onDone }: {
  x: number
  y: number
  blockIds: string[]
  moveFrom?: string
  onClose: () => void
  onDone?: () => void
}) {
  const { cards, add, removeBlock, cover } = useCollections()
  const open = useGrid((s) => s.filters.collection)
  const collectionBlocks = useGrid((s) => s.collectionBlocks)
  const blocks = useGrid((s) => s.blocks)
  const moodboards = useMoodboards()
  const trash = useTrash((s) => s.trash)
  // Un déplacement ouvre tout de suite le choix de la collection.
  const [view, setView] = useState<'main' | 'collection' | 'moodboard'>(moveFrom ? 'collection' : 'main')
  const [naming, setNaming] = useState(false)

  useEffect(() => {
    if (!moodboards.loaded) void moodboards.load()
  }, [moodboards])

  const picked = useMemo(() => {
    const wanted = new Set(blockIds)
    return blocks.filter((b) => wanted.has(b.id))
  }, [blocks, blockIds])
  // On peut retirer de la collection ouverte si c'est une des miennes et si tous les blocs y sont.
  const openIsMine = open && cards.find((c) => c.id === open.id)?.kind === 'manual'
  const removable = openIsMine && blockIds.every((id) => collectionBlocks?.has(id))
  const finish = () => {
    onDone?.()
    onClose()
  }
  /** Range les blocs dans la collection choisie ; en mode déplacement, on les retire ensuite de la collection d'origine. */
  const put = async (collectionId: string) => {
    await add(collectionId, blockIds)
    if (moveFrom) await Promise.all(blockIds.map((id) => removeBlock(moveFrom, id)))
    finish()
  }

  const left = Math.max(8, Math.min(x, window.innerWidth - 340))
  const top = Math.max(8, Math.min(y, window.innerHeight - (view === 'collection' ? 560 : 340)))
  const many = blockIds.length > 1
  const count = many ? ` (${blockIds.length} images)` : ''

  return (
    <div className="fixed inset-0 z-[60]" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }}>
      <div
        className="absolute w-80 overflow-hidden rounded-2xl border shadow-xl"
        style={{ left, top, background: 'var(--bg)', borderColor: 'var(--border)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {view === 'collection' && (
          <>
            {!moveFrom && (
              <button className="flex items-center gap-1 px-3 pt-2.5 text-xs" style={{ color: 'var(--fg-muted)' }} onClick={() => setView('main')}><ChevronLeft size={14} /> Retour</button>
            )}
            <CollectionPicker exclude={moveFrom ?? null} onPick={(id) => void put(id)} />
          </>
        )}

        {view === 'moodboard' && (
          <div className="p-1.5">
            <button className="flex items-center gap-1 px-2 pb-1 pt-1 text-xs" style={{ color: 'var(--fg-muted)' }} onClick={() => setView('main')}><ChevronLeft size={14} /> Retour</button>
            <div className={head} style={{ color: 'var(--fg-muted)' }}>Ajouter à un moodboard{count}</div>
            <div className="max-h-64 overflow-auto">
              {moodboards.cards.length === 0 && <div className="px-2 py-1.5 text-sm" style={{ color: 'var(--fg-muted)' }}>Tu n'as encore aucun moodboard.</div>}
              {moodboards.cards.map((m) => (
                <button key={m.id} className={item} onClick={() => void moodboards.addBlocks(m.id, m.name, picked.map(refOf)).then(finish)}>{m.name}</button>
              ))}
            </div>
            {naming ? (
              <NameInput
                placeholder="Nom du moodboard"
                confirmLabel="Créer"
                className="p-1"
                onCancel={() => setNaming(false)}
                onSubmit={(name) => void moodboards.create(name).then((id) => moodboards.addBlocks(id, name, picked.map(refOf))).then(finish)}
              />
            ) : (
              <button className={item} onClick={() => setNaming(true)}>+ Nouveau moodboard…</button>
            )}
          </div>
        )}

        {view === 'main' && (
          <div className="p-1.5">
            <button className={entry} onClick={() => setView('collection')}>Ajouter à une collection…{count} <ChevronRight size={16} /></button>
            {FEATURES.moodboards && <button className={entry} onClick={() => setView('moodboard')}>Ajouter à un moodboard… <ChevronRight size={16} /></button>}
            {openIsMine && blockIds.length === 1 && open && (
              <button className={item} onClick={() => void cover(open.id, blockIds[0]).then(finish)}>Utiliser comme couverture de « {open.name} »</button>
            )}
            <div className="mt-1 border-t pt-1" style={{ borderColor: 'var(--border)' }}>
              {removable && open && (
                <button className={item} onClick={() => void Promise.all(blockIds.map((id) => removeBlock(open.id, id))).then(finish)}>
                  Retirer de « {open.name} »
                </button>
              )}
              <button className={item} style={{ color: '#d44c47' }} onClick={() => void trash(blockIds).then(finish)}>
                Mettre à la corbeille{count}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
