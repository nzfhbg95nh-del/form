import { useEffect, useMemo, useState } from 'react'
import { Images, MoreHorizontal, Plus } from 'lucide-react'
import { getDb } from '@/biblio/lib/db.ts'
import { createBoard } from '@/biblio/lib/formBoards.ts'
import { imagesLabel, listBoards, type BoardCard } from '@/biblio/lib/moodboardList.ts'
import { useApp } from '@/store/app'
import { NameInput } from './NameInput.tsx'

const nf = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

/** L'aperçu d'un moodboard : jusqu'à trois de ses images (une grande à gauche, deux petites à droite), comme les collections. */
function Mosaic({ thumbs }: { thumbs: string[] }) {
  const [a, b, c] = thumbs
  const img = (src: string) => <img src={src} alt="" draggable={false} decoding="async" className="h-full w-full object-cover" />
  return (
    <div className="grid aspect-[4/3] w-full gap-0.5 overflow-hidden rounded-2xl" style={{ background: 'var(--bg-hover)', gridTemplateColumns: b ? '2fr 1fr' : '1fr', gridTemplateRows: c ? '1fr 1fr' : '1fr' }}>
      {a ? <div className={c ? 'row-span-2' : ''}>{img(a)}</div> : <div className="flex items-center justify-center" style={{ color: 'var(--fg-muted)' }}><Images size={32} /></div>}
      {b && <div>{img(b)}</div>}
      {c && <div>{img(c)}</div>}
    </div>
  )
}

/** Renommer / mettre à la corbeille un moodboard depuis sa carte. */
function CardMenu({ card }: { card: BoardCard }) {
  const update = useApp((s) => s.update)
  const trash = useApp((s) => s.trash)
  const [mode, setMode] = useState<'closed' | 'menu' | 'rename' | 'delete'>('closed')
  const close = () => setMode('closed')
  const item = 'block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)]'
  return (
    <div className="absolute right-1.5 top-1.5 z-10" onClick={(e) => e.stopPropagation()}>
      <button
        className="rounded-md bg-black/55 p-1 text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
        style={mode !== 'closed' ? { opacity: 1 } : undefined}
        aria-label={`Actions pour ${card.name}`}
        onClick={() => setMode(mode === 'closed' ? 'menu' : 'closed')}
      >
        <MoreHorizontal size={16} />
      </button>
      {mode !== 'closed' && (
        <>
          <div className="fixed inset-0 z-10" onMouseDown={close} />
          <div className="absolute right-0 top-8 z-20 w-64 rounded-lg border p-1.5 shadow-lg" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
            {mode === 'menu' && (
              <>
                <button className={item} onClick={() => setMode('rename')}>Renommer</button>
                <button className={item} onClick={() => setMode('delete')}>Mettre à la corbeille…</button>
              </>
            )}
            {mode === 'rename' && <NameInput initial={card.name} placeholder="Nouveau nom" onCancel={close} onSubmit={(name) => void update(card.id, { title: name }).then(close)} />}
            {mode === 'delete' && (
              <div className="p-1 text-sm">
                Mettre le moodboard « {card.name} » à la corbeille de Form ? Tu pourras le récupérer. Les images de ta bibliothèque ne sont pas touchées.
                <div className="mt-2 flex gap-1.5">
                  <button className="btn" onClick={() => void trash(card.id).then(close)}>Mettre à la corbeille</button>
                  <button className="btn" onClick={close}>Annuler</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * La page « Moodboards » de la bibliothèque : les moodboards de Form (ceux de la barre latérale comme ceux posés dans une page avec « /moodboard »).
 * Ce sont les mêmes pages : un moodboard créé ici est aussi dans Form, et inversement. Un clic ouvre le moodboard.
 */
export function MoodboardsView() {
  const objects = useApp((s) => s.objects)
  const select = useApp((s) => s.select)
  const [naming, setNaming] = useState(false)
  const [thumbs, setThumbs] = useState<Record<string, string[]>>({})
  const boards = useMemo(() => listBoards(objects), [objects])
  // Les aperçus sont relus quand un moodboard change (images ajoutées depuis la bibliothèque ou sur sa toile).
  const key = boards.map((b) => b.id + b.updatedAt).join('|')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const db = await getDb()
      const next: Record<string, string[]> = {}
      for (const b of boards) {
        const rows = await db.select<{ thumb_url: string | null; data_url: string }[]>('SELECT thumb_url, data_url FROM board_assets WHERE board_id = $1 ORDER BY created_at DESC LIMIT 3', [b.id])
        next[b.id] = rows.map((r) => r.thumb_url || r.data_url).filter(Boolean)
      }
      if (!cancelled) setThumbs(next)
    })().catch(() => undefined)
    return () => { cancelled = true }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const create = async (name: string) => {
    setNaming(false)
    select(await createBoard(name))
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h1 className="flex-1 text-3xl font-bold">Moodboards</h1>
          {naming ? (
            <NameInput placeholder="Nom du moodboard" confirmLabel="Créer" onCancel={() => setNaming(false)} onSubmit={(name) => void create(name)} className="w-96" />
          ) : (
            <button className="flex items-center gap-1.5 rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white" onClick={() => setNaming(true)}><Plus size={14} /> Nouveau moodboard</button>
          )}
        </div>
        {boards.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>Tu n'as pas encore de moodboard. Crée-en un ici, ou dans une page avec « /moodboard ». Pour y mettre des images, fais un clic droit sur une image de la bibliothèque puis « Ajouter à un moodboard ».</p>
        ) : (
          <div className="grid gap-x-5 gap-y-7" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {boards.map((b) => (
              <div key={b.id} className="group relative">
                <button className="flex w-full flex-col gap-2 text-left" onClick={() => select(b.id)}>
                  <Mosaic thumbs={thumbs[b.id] ?? []} />
                  <div className="min-w-0 px-0.5">
                    <div className="truncate text-sm font-medium">{b.name}</div>
                    <div className="truncate text-xs" style={{ color: 'var(--fg-muted)' }}>
                      {imagesLabel(b.images)} · {nf.format(new Date(b.updatedAt))}{b.parentName ? ` · dans « ${b.parentName} »` : ''}
                    </div>
                  </div>
                </button>
                <CardMenu card={b} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
