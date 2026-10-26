import { useEffect, useMemo, useState } from 'react'
import { SearchInput } from '@/components/SearchInput'
import { EmptyState, LoadingState } from '@/components/States'
import { FolderOpen, Pencil, Plus } from 'lucide-react'
import { groupCollections, type CollectionCard } from '@/biblio/lib/collections.ts'
import { fileUrl, thumbPath } from '@/biblio/lib/media.ts'
import { useCollections } from '@/biblio/store/collections.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { CollectionSettings } from './CollectionSettings.tsx'
import { NameInput } from './NameInput.tsx'
import { useReorder } from './useReorder.ts'

const nf = new Intl.NumberFormat('fr-FR')

/**
 * L'aperçu d'une collection, façon Pinterest : une grande image à gauche (la couverture, ou la plus récente) et deux petites à droite.
 * Avec une seule image, elle remplit la carte ; avec deux, la seconde occupe toute la colonne de droite.
 */
export function Mosaic({ card, thumbsDir }: { card: CollectionCard; thumbsDir: string }) {
  const [a, b, c] = card.previews
  const img = (thumb: string) => <img src={fileUrl(thumbPath(thumbsDir, thumb))} alt="" draggable={false} decoding="async" loading="lazy" className="h-full w-full object-cover" />
  return (
    <div className="grid aspect-[4/3] w-full gap-0.5 overflow-hidden rounded-2xl shadow-[var(--shadow-soft)]" style={{ background: 'var(--bg-hover)', gridTemplateColumns: b ? '2fr 1fr' : '1fr', gridTemplateRows: c ? '1fr 1fr' : '1fr' }}>
      <div className={c ? 'row-span-2' : ''}>{a && img(a)}</div>
      {b && <div className={c ? '' : 'row-span-1'}>{img(b)}</div>}
      {c && <div>{img(c)}</div>}
    </div>
  )
}

export const cardSubtitle = (card: CollectionCard) =>
  `${nf.format(card.count)} bloc${card.count > 1 ? 's' : ''}${card.kind === 'pinterest' && card.owner ? ` · ${card.owner}` : ''}${card.kind === 'instagram' ? ' · tous les comptes' : ''}${card.kind === 'unsorted' ? ' · pas encore rangées' : ''}`

/** Le petit crayon d'une de mes collections : il ouvre la fenêtre de réglages (couverture, nom, description, ordre, suppression). */
function EditButton({ card }: { card: CollectionCard }) {
  const [open, setOpen] = useState(false)
  return (
    // Un cadre de la taille de l'aperçu (4/3) posé dessus : le crayon est en bas à droite de l'image, pas de la carte entière.
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 aspect-[4/3]" onClick={(e) => e.stopPropagation()}>
      <button
        className="pointer-events-auto absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-black opacity-0 shadow group-hover:opacity-100 focus:opacity-100"
        aria-label={`Modifier ${card.name}`}
        title="Modifier le tableau"
        onClick={() => setOpen(true)}
      >
        <Pencil size={15} />
      </button>
      {open && <CollectionSettings card={card} onClose={() => setOpen(false)} />}
    </div>
  )
}

export function Card({ card, thumbsDir, onOpen }: { card: CollectionCard; thumbsDir: string; onOpen: (c: CollectionCard) => void }) {
  return (
    <div className="group relative">
      <button className="flex w-full flex-col gap-2 text-left" onClick={() => onOpen(card)}>
        <Mosaic card={card} thumbsDir={thumbsDir} />
        <div className="min-w-0 px-0.5">
          <div className="truncate text-sm font-medium">{card.name}</div>
          <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>{cardSubtitle(card)}</div>
        </div>
      </button>
      {card.kind === 'manual' && <EditButton card={card} />}
    </div>
  )
}

function Section({ title, empty, showCount = true, cards, thumbsDir, onOpen, onOrder }: {
  title: string
  empty?: string
  showCount?: boolean
  cards: CollectionCard[]
  thumbsDir: string
  onOpen: (c: CollectionCard) => void
  /** Si donné, les cartes se réorganisent par glisser-déposer. */
  onOrder?: (ids: string[]) => void
}) {
  const drag = useReorder(cards.map((c) => c.id), (ids) => onOrder?.(ids))
  if (cards.length === 0 && !empty) return null
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {showCount && cards.length > 0 && <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>{nf.format(cards.length)}</span>}
      </div>
      {cards.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>{empty}</p>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {cards.map((c) =>
            onOrder ? (
              <div
                key={c.id}
                {...drag.props(c.id)}
                className="cursor-grab active:cursor-grabbing"
                style={{
                  opacity: drag.dragging === c.id ? 0.4 : 1,
                  outline: drag.over === c.id && drag.dragging !== c.id ? '2px solid var(--accent)' : 'none',
                  outlineOffset: 4,
                  borderRadius: 16,
                }}
              >
                <Card card={c} thumbsDir={thumbsDir} onOpen={onOpen} />
              </div>
            ) : (
              <Card key={c.id} card={c} thumbsDir={thumbsDir} onOpen={onOpen} />
            ),
          )}
        </div>
      )}
    </section>
  )
}

/** La page « Collections » : mes collections, mes tableaux Pinterest, ceux d'autres comptes, et Instagram. */
export function CollectionsView({ onOpen }: { onOpen: (c: CollectionCard) => void }) {
  const thumbsDir = useGrid((s) => s.thumbsDir)
  const loaded = useGrid((s) => s.loaded)
  const { cards, loaded: cardsLoaded, load, create, reorder } = useCollections()
  const [query, setQuery] = useState('')
  const [naming, setNaming] = useState(false)

  useEffect(() => {
    void load()
  }, [loaded, load])

  const sections = useMemo(() => groupCollections(cards, query), [cards, query])
  const none = cardsLoaded && Object.values(sections).every((s) => s.length === 0)
  const searching = query.trim() !== ''

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b px-6 py-2.5" style={{ borderColor: 'var(--border)' }}>
        <h1 className="text-base font-semibold">Collections</h1>
        <SearchInput className="w-[26rem] max-w-full" placeholder="Chercher une collection ou un tableau" label="Chercher une collection" value={query} onChange={setQuery} />
        <div className="ml-auto">
          {naming ? (
            <NameInput
              placeholder="Nom de la collection"
              confirmLabel="Créer"
              onCancel={() => setNaming(false)}
              onSubmit={(name) => void create(name).then(() => setNaming(false))}
            />
          ) : (
            <button className="btn btn-primary" onClick={() => setNaming(true)}><Plus size={15} /> Nouvelle collection</button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {!cardsLoaded ? <LoadingState label="Chargement des collections…" /> : none ? (
          <EmptyState icon={<FolderOpen size={24} />} title={searching ? 'Aucune collection ne correspond' : 'Aucune collection pour le moment'} hint={searching ? undefined : 'Indexe d\'abord la bibliothèque dans Réglages > Bibliothèque.'} />
        ) : (
          <>
            <Section
              title="Mes collections"
              empty={searching ? undefined : 'Aucune pour l\'instant. Crée-en une avec « Nouvelle collection », ou fais un clic droit sur une image : « Ajouter à… ».'}
              cards={sections.mine}
              thumbsDir={thumbsDir}
              onOpen={onOpen}
              onOrder={searching ? undefined : (ids) => void reorder(ids)}
            />
            <Section title="Tableaux d'autres comptes" cards={sections.otherBoards} thumbsDir={thumbsDir} onOpen={onOpen} />
            <Section title="Autres" showCount={false} cards={[...sections.unsorted, ...sections.instagram]} thumbsDir={thumbsDir} onOpen={onOpen} />
          </>
        )}
      </div>
    </div>
  )
}
