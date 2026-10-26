import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import { bestChoices, childrenOf, collectionPath, loadCollectionCounts, manualCollections, recentCollections, rememberCollection, savedCollections, savedNote, searchCollections, type CollectionCard } from '@/biblio/lib/collections.ts'
import { fileUrl, thumbPath } from '@/biblio/lib/media.ts'
import { useCollections } from '@/biblio/store/collections.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { NameInput } from './NameInput.tsx'

const heading = 'px-3 pb-1 pt-3 text-xs font-medium'

/** Une ligne : miniature, nom, et une flèche pour entrer dans les sous-tableaux. */
function Row({ card, label, note, hasChildren, onPick, onEnter }: {
  card: CollectionCard
  label?: string
  /** Écrit sous le nom : « Déjà enregistrée » quand l'image est déjà dans cette collection. */
  note?: string
  hasChildren: boolean
  onPick: () => void
  onEnter: () => void
}) {
  const thumbsDir = useGrid((s) => s.thumbsDir)
  const thumb = card.previews[0]
  return (
    <div className="flex items-center rounded-xl hover:bg-[var(--bg-hover)]">
      <button className="flex min-w-0 flex-1 items-center gap-3 px-3 py-1.5 text-left" onClick={onPick}>
        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--bg-hover)' }}>
          {thumb && <img src={fileUrl(thumbPath(thumbsDir, thumb))} alt="" draggable={false} loading="lazy" className="h-full w-full object-cover" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{label ?? card.name}</span>
          {note && <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--accent)' }}><Check size={12} /> {note}</span>}
        </span>
      </button>
      {hasChildren && (
        <button className="mr-1 rounded-full p-2 hover:bg-[var(--bg-hover)]" onClick={onEnter} aria-label={`Voir les sous-tableaux de ${card.name}`} title="Sous-tableaux">
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  )
}

/**
 * « Enregistrer dans… » façon Pinterest : une recherche, les meilleurs choix (la collection ouverte et les dernières utilisées),
 * puis tous mes tableaux avec leur miniature ; la flèche ouvre les sous-tableaux ; on peut créer un tableau ou un sous-tableau.
 * `exclude` : une collection à ne pas proposer (celle d'où l'on déplace).
 * `blockIds` : les images qu'on range ; les collections qui les contiennent déjà passent tout en haut, marquées « Déjà enregistrée ».
 */
export function CollectionPicker({ exclude = null, blockIds, onPick }: { exclude?: string | null; blockIds?: string[]; onPick: (collectionId: string) => void }) {
  const { cards, create } = useCollections()
  const open = useGrid((s) => s.filters.collection)
  const [query, setQuery] = useState('')
  const [parent, setParent] = useState<string[]>([])
  const [naming, setNaming] = useState(false)
  const current = parent.length > 0 ? cards.find((c) => c.id === parent[parent.length - 1]) : undefined

  useEffect(() => setNaming(false), [parent])

  const [counts, setCounts] = useState<ReadonlyMap<string, number>>(new Map())
  const total = blockIds?.length ?? 0
  const idsKey = blockIds?.join('|') ?? ''
  useEffect(() => {
    let cancelled = false
    if (total === 0) { setCounts(new Map()); return }
    void loadCollectionCounts(blockIds ?? []).then((m) => { if (!cancelled) setCounts(m) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [idsKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const saved = useMemo(() => savedCollections(cards, counts, exclude), [cards, counts, exclude])
  const savedIds = useMemo(() => new Set(saved.map((c) => c.id)), [saved])
  const noteOf = (c: CollectionCard) => (counts.get(c.id) ? savedNote(counts.get(c.id) ?? 0, total) : undefined)

  const recent = useMemo(() => recentCollections(), [])
  const best = useMemo(() => bestChoices(cards, recent, open?.id ?? null, exclude).filter((c) => !savedIds.has(c.id)), [cards, recent, open?.id, exclude, savedIds])
  const top = useMemo(() => manualCollections(cards).filter((c) => !c.parentId && c.id !== exclude).sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9) || a.name.localeCompare(b.name, 'fr')), [cards, exclude])
  const topRest = useMemo(() => top.filter((c) => !savedIds.has(c.id)), [top, savedIds])
  // Dans une recherche aussi, les collections qui contiennent déjà l'image passent en premier.
  const found = useMemo(() => {
    const list = searchCollections(cards, query, exclude)
    return [...list.filter((c) => savedIds.has(c.id)), ...list.filter((c) => !savedIds.has(c.id))]
  }, [cards, query, exclude, savedIds])

  const hasKids = (c: CollectionCard) => childrenOf(cards, c.id).some((k) => k.id !== exclude)

  const pick = (id: string) => {
    rememberCollection(id)
    onPick(id)
  }
  const row = (c: CollectionCard, withPath = false) => (
    <Row key={c.id} card={c} label={withPath ? collectionPath(cards, c.id) : undefined} note={noteOf(c)} hasChildren={!withPath && hasKids(c)} onPick={() => pick(c.id)} onEnter={() => setParent([...parent, c.id])} />
  )

  // Vue d'un tableau : lui-même, puis ses sous-tableaux.
  if (current) {
    const kids = childrenOf(cards, current.id).filter((k) => k.id !== exclude)
    return (
      <div className="flex max-h-[60vh] flex-col">
        <div className="relative flex items-center justify-center px-3 py-2.5">
          <button className="absolute left-2 rounded-full p-2 hover:bg-[var(--bg-hover)]" onClick={() => setParent(parent.slice(0, -1))} aria-label="Retour"><ChevronLeft size={18} /></button>
          <span className="text-sm font-semibold">Ranger dans</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto pb-1">
          <div className={heading} style={{ color: 'var(--fg-muted)' }}>Tableau</div>
          <div className="border-y-2" style={{ borderColor: 'var(--accent)' }}>{row(current)}</div>
          {kids.length > 0 && <div className={heading} style={{ color: 'var(--fg-muted)' }}>Sous-tableau</div>}
          {kids.map((k) => row(k))}
        </div>
        <div className="border-t p-1.5" style={{ borderColor: 'var(--border)' }}>
          {naming ? (
            <NameInput className="p-1" placeholder="Nom du sous-tableau" confirmLabel="Créer" onCancel={() => setNaming(false)} onSubmit={(name) => void create(name, current.id).then(pick)} />
          ) : (
            <button className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-[var(--bg-hover)]" onClick={() => setNaming(true)}>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: 'var(--bg-hover)' }}><Plus size={18} /></span>
              <span className="text-sm font-semibold">Créer un sous-tableau</span>
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex max-h-[60vh] flex-col">
      <div className="px-3 pb-1 pt-3 text-center text-sm font-semibold">Ranger dans</div>
      <div className="px-3 pb-1 pt-1">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--fg-muted)' }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Rechercher"
            aria-label="Rechercher une collection"
            className="w-full rounded-full border-2 py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)]"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto pb-1">
        {query.trim() ? (
          found.length === 0 ? (
            <div className="px-4 py-4 text-sm" style={{ color: 'var(--fg-muted)' }}>Aucune collection ne correspond.</div>
          ) : (
            found.map((c) => row(c, true))
          )
        ) : (
          <>
            {saved.length > 0 && <div className={heading} style={{ color: 'var(--accent)' }}>{total > 1 ? 'Déjà enregistrées dans' : 'Déjà enregistrée dans'}</div>}
            {saved.map((c) => row(c, !!c.parentId))}
            {best.length > 0 && <div className={heading} style={{ color: 'var(--fg-muted)' }}>Meilleurs choix</div>}
            {best.map((c) => row(c))}
            <div className={heading} style={{ color: 'var(--fg-muted)' }}>Tous les tableaux</div>
            {top.length === 0 && <div className="px-4 py-2 text-sm" style={{ color: 'var(--fg-muted)' }}>Tu n'as pas encore de collection.</div>}
            {topRest.map((c) => row(c))}
          </>
        )}
      </div>
      <div className="border-t p-1.5" style={{ borderColor: 'var(--border)' }}>
        {naming ? (
          <NameInput className="p-1" placeholder="Nom du tableau" confirmLabel="Créer" onCancel={() => setNaming(false)} onSubmit={(name) => void create(name, null).then(pick)} />
        ) : (
          <button className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-[var(--bg-hover)]" onClick={() => setNaming(true)}>
            <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: 'var(--bg-hover)' }}><Plus size={18} /></span>
            <span className="text-sm font-semibold">Créer un tableau</span>
          </button>
        )}
      </div>
    </div>
  )
}

/** Le sélecteur dans une petite fenêtre posée à l'endroit demandé (fond cliquable pour fermer). */
export function PickerPopover({ x, y, exclude, blockIds, onPick, onClose }: { x: number; y: number; exclude?: string | null; blockIds?: string[]; onPick: (collectionId: string) => void; onClose: () => void }) {
  const left = Math.max(8, Math.min(x, window.innerWidth - 340))
  const top = Math.max(8, Math.min(y, window.innerHeight - 560))
  return (
    <div className="fixed inset-0 z-[60]" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }}>
      <div className="absolute w-80 overflow-hidden rounded-2xl border shadow-xl" style={{ left, top, background: 'var(--bg)', borderColor: 'var(--border)' }} onMouseDown={(e) => e.stopPropagation()}>
        <CollectionPicker exclude={exclude ?? null} blockIds={blockIds} onPick={onPick} />
      </div>
    </div>
  )
}
