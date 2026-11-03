import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EmptyState } from '@/components/States'
import { FileDown, FileUp, Images, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react'
import { exportBoard, importBoard } from '@/lib/boardTransfer'
import { getDb } from '@/biblio/lib/db.ts'
import { createBoard, createBoardWithCover, setBoardCoverFromFile } from '@/biblio/lib/formBoards.ts'
import { imagesLabel, listBoards, withCoverAsset, type BoardCard } from '@/biblio/lib/moodboardList.ts'
import { useToast } from '@/biblio/store/toast.ts'
import { useApp } from '@/store/app'
import { NewMoodboardDialog } from './NewMoodboardDialog.tsx'

const nf = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

/** L'aperçu d'un moodboard : jusqu'à trois de ses images (une grande à gauche, deux petites à droite), comme les collections. */
function Mosaic({ thumbs }: { thumbs: string[] }) {
  const [a, b, c] = thumbs
  const img = (src: string) => <img src={src} alt="" draggable={false} decoding="async" className="h-full w-full object-cover" />
  return (
    <div className="grid aspect-[4/3] w-full gap-0.5 relative overflow-hidden rounded-2xl shadow-[var(--shadow-soft)] after:pointer-events-none after:absolute after:inset-0 after:bg-black/0 after:transition-colors after:duration-200 after:content-[''] group-hover:after:bg-black/10" style={{ background: 'var(--bg-hover)', gridTemplateColumns: b ? '2fr 1fr' : '1fr', gridTemplateRows: c ? '1fr 1fr' : '1fr' }}>
      {a ? <div className={c ? 'row-span-2' : ''}>{img(a)}</div> : <div className="flex items-center justify-center" style={{ color: 'var(--fg-muted)' }}><Images size={32} /></div>}
      {b && <div>{img(b)}</div>}
      {c && <div>{img(c)}</div>}
    </div>
  )
}

/** Choisir, parmi les images du moodboard, celle qui passe en avant sur sa carte. */
function CoverChooser({ card, onClose }: { card: BoardCard; onClose: () => void }) {
  const update = useApp((s) => s.update)
  const [assets, setAssets] = useState<{ id: string; src: string }[] | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const db = await getDb()
      const rows = await db.select<{ id: string; thumb_url: string | null; data_url: string }[]>('SELECT id, thumb_url, data_url FROM board_assets WHERE board_id = $1 ORDER BY created_at DESC LIMIT 300', [card.id])
      if (!cancelled) setAssets(rows.map((r) => ({ id: r.id, src: r.thumb_url || r.data_url })))
    })().catch(() => { if (!cancelled) setAssets([]) })
    return () => { cancelled = true }
  }, [card.id])
  const pick = async (id: string | null) => {
    const current = useApp.getState().objects.find((o) => o.id === card.id)
    await update(card.id, { properties: withCoverAsset(current?.properties ?? null, id) })
    onClose()
  }
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Choisir l'image de couverture"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl p-4 shadow-2xl"
        style={{ background: 'var(--bg)', color: 'var(--fg)' }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex-1 text-base font-semibold">Image de couverture de « {card.name} »</h2>
          <button className="rounded p-1 hover:bg-[var(--bg-hover)]" onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>
        <p className="mb-3 text-sm" style={{ color: 'var(--fg-muted)' }}>Clique sur l'image qui doit passer en avant sur la carte du moodboard.</p>
        {assets === null ? null : assets.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>Ce moodboard n'a pas encore d'image.</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
              {assets.map((a) => (
                <button
                  key={a.id}
                  onClick={() => void pick(a.id)}
                  className="aspect-square overflow-hidden rounded-lg"
                  style={{ background: 'var(--bg-hover)', outline: card.coverAsset === a.id ? '3px solid var(--accent)' : 'none', outlineOffset: -3 }}
                  aria-label="Choisir cette image"
                >
                  <img src={a.src} alt="" draggable={false} loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
        {card.coverAsset && <button className="btn mt-3 self-start" onClick={() => void pick(null)}>Revenir aux images les plus récentes</button>}
      </div>
    </div>
  )
}

/** Une ligne du menu d'un moodboard : une petite icône teintée, puis le texte. */
function MenuItem({ icon, children, danger = false, onClick }: { icon: ReactNode; children: ReactNode; danger?: boolean; onClick: () => void }) {
  const tint = danger ? '#d44c47' : 'var(--fg)'
  return (
    <button className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-sm transition-colors hover:bg-[var(--bg-hover)]" onClick={onClick} style={danger ? { color: '#d44c47' } : undefined}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${tint} ${danger ? 14 : 8}%, transparent)`, color: tint }}>{icon}</span>
      {children}
    </button>
  )
}

/** Modifier (nom et photo de couverture) ou mettre à la corbeille un moodboard depuis sa carte. */
function CardMenu({ card, coverSrc }: { card: BoardCard; coverSrc: string | null }) {
  const update = useApp((s) => s.update)
  const trash = useApp((s) => s.trash)
  const restore = useApp((s) => s.restore)
  const [mode, setMode] = useState<'closed' | 'menu' | 'edit' | 'cover'>('closed')
  const close = () => setMode('closed')
  // Pas de question : le moodboard va dans la corbeille de Form, et le message permet de le remettre aussitôt.
  const remove = async () => {
    close()
    await trash(card.id)
    useToast.getState().show(`« ${card.name} » est à la corbeille.`, { label: 'Annuler', run: () => void restore(card.id) })
  }
  const save = async (name: string, file: File | null, coverRemoved: boolean) => {
    if (name !== card.name) await update(card.id, { title: name })
    if (file) await setBoardCoverFromFile(card.id, file)
    else if (coverRemoved) {
      const current = useApp.getState().objects.find((o) => o.id === card.id)
      await update(card.id, { properties: withCoverAsset(current?.properties ?? null, null) })
    }
    close()
  }
  return (
    <div className="pointer-events-auto absolute bottom-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
      <button
        className="rounded-md bg-black/55 p-1 text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
        style={mode !== 'closed' ? { opacity: 1 } : undefined}
        aria-label={`Actions pour ${card.name}`}
        onClick={() => setMode(mode === 'closed' ? 'menu' : 'closed')}
      >
        <MoreHorizontal size={16} />
      </button>
      {mode === 'cover' && <CoverChooser card={card} onClose={close} />}
      {mode === 'edit' && (
        <NewMoodboardDialog
          edit={{ name: card.name, coverSrc }}
          onCreate={(name, file, coverRemoved) => void save(name, file, coverRemoved)}
          onPickFromBoard={() => setMode('cover')}
          onClose={close}
        />
      )}
      {mode !== 'closed' && mode !== 'cover' && mode !== 'edit' && (
        <>
          <div className="fixed inset-0 z-10" onMouseDown={close} />
          <div className={'absolute bottom-8 right-0 z-20 w-64 rounded-xl border p-1.5 shadow-lg'} style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
            {mode === 'menu' && (
              <>
                <MenuItem icon={<Pencil size={14} />} onClick={() => setMode('edit')}>Modifier…</MenuItem>
                <MenuItem icon={<FileDown size={14} />} onClick={() => { close(); void exportBoard(card.id) }}>Exporter en fichier…</MenuItem>
                <MenuItem icon={<Trash2 size={14} />} danger onClick={() => void remove()}>Mettre à la corbeille</MenuItem>
              </>
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
  const importInput = useRef<HTMLInputElement>(null)
  const [thumbs, setThumbs] = useState<Record<string, string[]>>({})
  const boards = useMemo(() => listBoards(objects), [objects])
  // Les aperçus sont relus quand un moodboard change (images ajoutées depuis la bibliothèque ou sur sa toile).
  const key = boards.map((b) => b.id + b.updatedAt + (b.coverAsset ?? '')).join('|')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const db = await getDb()
      const next: Record<string, string[]> = {}
      for (const b of boards) {
        const pick = (r: { thumb_url: string | null; data_url: string }) => r.thumb_url || r.data_url
        // L'image de couverture choisie passe en avant ; les plus récentes complètent l'aperçu.
        const first = b.coverAsset ? await db.select<{ thumb_url: string | null; data_url: string }[]>('SELECT thumb_url, data_url FROM board_assets WHERE board_id = $1 AND id = $2', [b.id, b.coverAsset]) : []
        const rest = await db.select<{ thumb_url: string | null; data_url: string }[]>(
          `SELECT thumb_url, data_url FROM board_assets WHERE board_id = $1${first.length > 0 ? ' AND id <> $2' : ''} ORDER BY created_at DESC LIMIT ${first.length > 0 ? 2 : 3}`,
          first.length > 0 ? [b.id, b.coverAsset] : [b.id],
        )
        next[b.id] = [...first, ...rest].map(pick).filter(Boolean)
      }
      if (!cancelled) setThumbs(next)
    })().catch(() => undefined)
    return () => { cancelled = true }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const create = async (name: string, cover: File | null) => {
    setNaming(false)
    select(cover ? (await createBoardWithCover(name, cover)).id : await createBoard(name))
  }
  const importFile = async (file: File | undefined) => {
    if (!file) return
    const id = await importBoard(file)
    if (id) select(id)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b px-6 py-2.5" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold">Moodboards</h1>
          <span className="lib-count">{boards.length} moodboard{boards.length > 1 ? 's' : ''}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input ref={importInput} type="file" accept=".formboard,application/json" className="hidden" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = '' }} />
          <button className="btn" title="Ouvrir un moodboard exporté depuis Form (fichier .formboard)" onClick={() => importInput.current?.click()}><FileUp size={15} /> Importer</button>
          <button className="btn btn-primary" onClick={() => setNaming(true)}><Plus size={15} /> Nouveau moodboard</button>
          {naming && <NewMoodboardDialog onCreate={(name, cover) => void create(name, cover)} onClose={() => setNaming(false)} />}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {boards.length === 0 ? (
          <EmptyState icon={<Images size={24} />} title="Aucun moodboard pour le moment" hint="Clique pour ajouter un moodboard. Tu peux aussi en poser un dans une page avec « /moodboard »." action={{ label: 'Nouveau moodboard', onClick: () => setNaming(true) }} />
        ) : (
          <div className="grid gap-x-5 gap-y-7" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            <div>
              <button
                className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm font-medium transition-colors hover:bg-[var(--bg-hover)]"
                style={{ borderColor: 'var(--border)', color: 'var(--fg-muted)' }}
                onClick={() => setNaming(true)}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: 'var(--bg-hover)', color: 'var(--fg)' }}><Plus size={22} /></span>
                Nouveau moodboard
              </button>
            </div>
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
                {/* Les trois petits points : en bas à droite de l'image (le calque a la même forme que l'aperçu, 4/3). */}
                <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[4/3]"><CardMenu card={b} coverSrc={b.coverAsset ? (thumbs[b.id]?.[0] ?? null) : null} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
