import { useEffect, useState } from 'react'
import { FolderPlus, ListChecks, Pencil } from 'lucide-react'
import { childrenOf, collectionPath, openTarget, type CollectionCard } from '@/biblio/lib/collections.ts'
import { fileUrl, thumbPath } from '@/biblio/lib/media.ts'
import { useCollections } from '@/biblio/store/collections.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { CollectionSettings } from './CollectionSettings.tsx'
import { NameInput } from './NameInput.tsx'
import { useReorder } from './useReorder.ts'

const nf = new Intl.NumberFormat('fr-FR')

/** Trois aperçus côte à côte, comme les sous-tableaux de Pinterest. */
function Strip({ card, thumbsDir }: { card: CollectionCard; thumbsDir: string }) {
  const cells = [card.previews[0], card.previews[1], card.previews[2]]
  return (
    <div className="grid aspect-[16/7] w-full grid-cols-3 gap-0.5 overflow-hidden rounded-2xl" style={{ background: 'var(--bg-hover)' }}>
      {cells.map((thumb, i) =>
        thumb ? <img key={i} src={fileUrl(thumbPath(thumbsDir, thumb))} alt="" draggable={false} decoding="async" loading="lazy" className="h-full w-full object-cover" /> : <div key={i} />,
      )}
    </div>
  )
}

/** Le crayon de la collection ouverte : la fenêtre de réglages (mes collections seulement). */
function EditButton({ card }: { card: CollectionCard }) {
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [card.id])
  if (card.kind !== 'manual') return null
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)} aria-label="Modifier le tableau" title="Modifier le tableau"><Pencil size={16} /></button>
      {open && <CollectionSettings card={card} onClose={() => setOpen(false)} />}
    </>
  )
}

/**
 * L'en-tête d'une collection ouverte, façon Pinterest : le titre, des actions, les sous-tableaux (qu'on peut glisser pour les
 * réorganiser), puis « Autres images » juste en dessous.
 */
export function CollectionHero() {
  const { filters, setFilters, thumbsDir, shown, organize, setOrganize } = useGrid()
  const { cards, create, reorder } = useCollections()
  const [naming, setNaming] = useState(false)
  const open = filters.collection
  const card = open ? cards.find((c) => c.id === open.id) : undefined
  const children = open ? childrenOf(cards, open.id) : []
  const drag = useReorder(children.map((c) => c.id), (ids) => void reorder(ids))

  useEffect(() => setNaming(false), [open?.id])
  if (!open) return null
  const canCreate = card && card.kind !== 'instagram' && card.kind !== 'unsorted'
  const parentPath = card?.parentId ? collectionPath(cards, card.parentId) : ''
  const hasSubs = children.length > 0

  return (
    <div className="px-8 pb-2 pt-10">
      <div className="flex items-start gap-4">
        <div className="min-w-0">
          {parentPath && <div className="mb-1 text-sm" style={{ color: 'var(--fg-muted)' }}>{parentPath}</div>}
          <h1 className="text-3xl font-semibold break-words">{open.name}</h1>
          <div className="mt-2 text-sm" style={{ color: 'var(--fg-muted)' }}>
            {card ? `${nf.format(card.count)} image${card.count > 1 ? 's' : ''}` : ''}
            {card?.kind === 'unsorted' ? ' · pas encore rangées dans une de tes collections' : ''}
            {hasSubs ? ` · ${children.length} sous-tableau${children.length > 1 ? 'x' : ''}` : ''}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {canCreate &&
          (naming ? (
            <NameInput className="w-96 max-w-full" placeholder="Nom du sous-tableau" confirmLabel="Créer" onCancel={() => setNaming(false)} onSubmit={(name) => void create(name, open.id).then(() => setNaming(false))} />
          ) : (
            <button className="btn" onClick={() => setNaming(true)}><FolderPlus size={15} /> Nouveau sous-tableau</button>
          ))}
        {!naming && (
          <button
            className="btn"
            onClick={() => setOrganize(!organize)}
            aria-pressed={organize}
            style={organize ? { background: 'var(--bg-hover)' } : undefined}
            title="Sélectionner plusieurs images pour les déplacer, les retirer ou les supprimer"
          >
            <ListChecks size={15} /> Organiser
          </button>
        )}
        {!naming && card && <EditButton card={card} />}
      </div>

      {hasSubs && (
        <div className="mt-8">
          <div className="grid gap-x-5 gap-y-7" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {children.map((c) => (
              <div
                key={c.id}
                {...drag.props(c.id)}
                className="cursor-grab transition-opacity active:cursor-grabbing"
                style={{
                  opacity: drag.dragging === c.id ? 0.4 : 1,
                  outline: drag.over === c.id && drag.dragging !== c.id ? '2px solid var(--accent)' : 'none',
                  outlineOffset: 4,
                  borderRadius: 18,
                }}
              >
                <button className="flex w-full flex-col gap-2 text-left" onClick={() => setFilters({ collection: openTarget(c) })}>
                  <Strip card={c} thumbsDir={thumbsDir} />
                  <div className="min-w-0 px-1">
                    <div className="truncate text-sm font-semibold">{c.name}</div>
                    <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>{nf.format(c.count)} image{c.count > 1 ? 's' : ''}</div>
                  </div>
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs" style={{ color: 'var(--fg-muted)' }}>Glisse un sous-tableau pour changer sa place.</div>
        </div>
      )}

      {(hasSubs || shown.length > 0) && (
        <div className="mt-10 flex items-center gap-3 border-t pt-6" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-semibold">{hasSubs && filters.collectionRest ? 'Autres images' : 'Images'}</h2>
          <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>{nf.format(shown.length)}</span>
        </div>
      )}
    </div>
  )
}
