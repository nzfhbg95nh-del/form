import { useEffect, useMemo, useRef, useState } from 'react'
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener'
import { ChevronLeft, ChevronRight, ExternalLink, FolderOpen, ImageOff, Map as MapIcon, X } from 'lucide-react'
import { loadBlockFiles, type BlockFileInfo, type GridBlock } from '@/biblio/lib/blocks.ts'
import { loadFileColors, type Swatch } from '@/biblio/lib/colors.ts'
import { getSearchIndex } from '@/biblio/lib/searchIndex.ts'
import { nearestBlocks } from '@/biblio/lib/semanticSearch.ts'
import { loadNote, saveNote } from '@/biblio/lib/notes.ts'
import { addBlockType, loadBlockTypes, removeBlockType, type BlockType } from '@/biblio/lib/types.ts'
import { formatDate, fileUrl, originalPath, thumbPath } from '@/biblio/lib/media.ts'
import { layoutMasonry } from '@/biblio/lib/grid.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { Tile } from './AllGrid.tsx'
import { BlockMenu } from './BlockMenu.tsx'
import { PickerPopover } from './CollectionPicker.tsx'
import { NameInput } from './NameInput.tsx'
import { collectionPath, loadBlockCollectionIds, manualCollections } from '@/biblio/lib/collections.ts'
import { addBlocksToBoard, addedMessage, boardsContaining, createBoard, useFormBoards } from '@/biblio/lib/formBoards.ts'
import { FEATURES } from '@/biblio/flags.ts'
import { useCollections } from '@/biblio/store/collections.ts'
import { useMapRequest } from '@/biblio/store/map.ts'
import { useToast } from '@/biblio/store/toast.ts'
import { useApp } from '@/store/app'
import { useTrash } from '@/biblio/store/trash.ts'
import { useLibrary } from '@/biblio/store/library.ts'

const SOURCE_LABEL = { instagram: 'Instagram', pinterest: 'Pinterest' } as const

/** Un nouveau bloc ouvert = un nouvel exemplaire (la clé repart de zéro : première image, rien de cassé). */
export function Lightbox() {
  const openId = useGrid((s) => s.openId)
  return openId ? <LightboxContent key={openId} /> : null
}

function LightboxContent() {
  const { blocks, shown, openId, open, thumbsDir } = useGrid()
  const root = useLibrary((s) => s.root)
  // On navigue parmi les blocs affichés (recherche et filtres respectés).
  const index = useMemo(() => (openId ? shown.findIndex((b) => b.id === openId) : -1), [shown, openId])
  const block = useMemo(() => blocks.find((b) => b.id === openId), [blocks, openId])
  const [files, setFiles] = useState<BlockFileInfo[]>([])
  const [pos, setPos] = useState(0)
  const [broken, setBroken] = useState<string | null>(null)
  const swipeFrom = useRef<number | null>(null)
  const lastWheel = useRef(0)
  /** Glisser (ou pousser à l'horizontale) pour passer d'une image du carrousel à l'autre. */
  const swipe = (delta: number) => setPos((p) => Math.max(0, Math.min(files.length - 1, p + delta)))

  useEffect(() => {
    if (!openId) return
    let cancelled = false
    void loadBlockFiles(openId).then((f) => {
      if (!cancelled) setFiles(f)
    })
    return () => {
      cancelled = true
    }
  }, [openId])

  useEffect(() => {
    if (!openId) return
    const go = (delta: number) => {
      const next = shown[index + delta]
      if (next) open(next.id)
    }
    const onKey = (e: KeyboardEvent) => {
      // Dans un champ de saisie (note, tag), les flèches servent au texte.
      const t = e.target as HTMLElement | null
      const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement
      if (typing && e.key !== 'Escape') return
      if (typing) {
        t.blur()
        return
      }
      if (e.key === 'Escape') open(null)
      else if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 1))
      else if (e.key === 'ArrowRight') setPos((p) => Math.min(files.length - 1, p + 1))
      else if (e.key === 'ArrowDown') go(1)
      else if (e.key === 'ArrowUp') go(-1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, index, shown, files.length, pos, open])

  if (!block) return null
  const file = files[pos]
  const full = file ? originalPath(root, file.rel) : null
  const fallbackThumb = file?.thumb ? fileUrl(thumbPath(thumbsDir, file.thumb)) : null

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto" style={{ background: 'var(--bg)' }} role="dialog" aria-label="Détail">
      <button className="btn absolute left-3 top-3 z-20" onClick={() => open(null)} aria-label="Fermer" title="Fermer (Échap)"><X size={16} /></button>
      <div className="flex h-full min-h-[520px] w-full overflow-hidden">
        <div className="relative flex min-w-0 flex-1 flex-col">
        {pos > 0 && (
          <button className="btn absolute left-3 top-1/2 z-10 -translate-y-1/2" onClick={() => swipe(-1)} aria-label="Image précédente du carrousel"><ChevronLeft size={18} /></button>
        )}
        {pos < files.length - 1 && (
          <button className="btn absolute right-3 top-1/2 z-10 -translate-y-1/2" onClick={() => swipe(1)} aria-label="Image suivante du carrousel"><ChevronRight size={18} /></button>
        )}
        <div
          className="flex min-h-0 flex-1 touch-pan-y select-none items-center justify-center p-14"
          onPointerDown={(e) => { swipeFrom.current = e.clientX; e.currentTarget.setPointerCapture(e.pointerId) }}
          onPointerUp={(e) => {
            const from = swipeFrom.current
            swipeFrom.current = null
            if (from === null || (e.target as HTMLElement).tagName === 'VIDEO') return
            const dx = e.clientX - from
            if (Math.abs(dx) > 60) swipe(dx < 0 ? 1 : -1)
          }}
          onWheel={(e) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 20 && Date.now() - lastWheel.current > 500) {
              lastWheel.current = Date.now()
              swipe(e.deltaX > 0 ? 1 : -1)
            }
          }}
        >
          {!file ? null : file.missing ? (
            <Notice text="Ce fichier est introuvable sur le disque." />
          ) : file.kind === 'video' && full ? (
            <video key={full} src={fileUrl(full)} controls autoPlay muted loop className="max-h-full max-w-full rounded-md" />
          ) : full && broken !== full ? (
            <img key={full} src={fileUrl(full)} alt="" draggable={false} onError={() => setBroken(full)} className="max-h-full max-w-full rounded-md object-contain" />
          ) : fallbackThumb ? (
            <div className="flex flex-col items-center gap-2">
              <img src={fallbackThumb} alt="" className="max-h-[80%] max-w-full rounded-md object-contain" />
              <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>Aperçu réduit : ce fichier ne peut pas être affiché en grand.</span>
            </div>
          ) : (
            <Notice text="Ce format ne peut pas être affiché (par exemple HEIC)." />
          )}
        </div>

        {files.length > 1 && (
          <div className="flex gap-2 overflow-x-auto border-t p-3" style={{ borderColor: 'var(--border)' }}>
            {files.map((f, i) => (
              <button
                key={f.rel}
                onClick={() => setPos(i)}
                className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2"
                style={{ borderColor: i === pos ? 'var(--accent)' : 'transparent', background: 'var(--bg-hover)' }}
                aria-label={`Image ${i + 1}`}
              >
                {f.thumb && <img src={fileUrl(thumbPath(thumbsDir, f.thumb))} alt="" className="h-full w-full object-cover" draggable={false} />}
              </button>
            ))}
          </div>
        )}
        </div>

      <aside className="w-[22rem] shrink-0 overflow-auto border-l px-6 py-7 [scrollbar-width:thin]" style={{ borderColor: 'var(--border)', background: 'var(--bg-side)' }}>
        <div className="lib-count mb-2">{SOURCE_LABEL[block.source]}</div>
        <div className="text-xl font-semibold tracking-tight break-words">{block.source === 'instagram' ? `@${block.owner}` : block.board}</div>
        {block.source === 'pinterest' && <div className="text-sm" style={{ color: 'var(--fg-muted)' }}>par {block.owner}</div>}
        {block.publishedAt && <div className="mt-2 text-sm">{formatDate(block.publishedAt)}</div>}
        {files.length > 1 && <div className="mt-1 text-sm" style={{ color: 'var(--fg-muted)' }}>Image {pos + 1} sur {files.length}</div>}

        <div className="mt-4 flex gap-2">
          <button className="btn h-9 w-9 justify-center !p-0" onClick={() => void openUrl(block.originUrl)} title={block.source === 'instagram' ? 'Ouvrir le profil Instagram' : 'Ouvrir sur Pinterest'} aria-label={block.source === 'instagram' ? 'Ouvrir le profil Instagram' : 'Ouvrir sur Pinterest'}>
            <ExternalLink size={15} />
          </button>
          <button className="btn h-9 w-9 justify-center !p-0" disabled={!full} onClick={() => full && void revealItemInDir(full)} title="Ouvrir dans l'Explorateur" aria-label="Ouvrir dans l'Explorateur">
            <FolderOpen size={15} />
          </button>
        </div>

        {file && <ColorPalette key={file.rel} rel={file.rel} />}

        <BlockCollections blockId={block.id} />

        {FEATURES.moodboards && <BlockMoodboards block={block} />}

        {FEATURES.carte && (
          <button className="btn mt-6 w-full" onClick={() => useMapRequest.getState().open(block.id)}>
            <MapIcon size={15} /> Voir sur la carte
          </button>
        )}

        <button
          className="btn mt-2 w-full"
          style={{ color: '#d44c47' }}
          onClick={() => {
            const next = shown[index + 1] ?? shown[index - 1]
            void useTrash.getState().trash([block.id]).then(() => open(next && next.id !== block.id ? next.id : null))
          }}
        >
          Mettre à la corbeille
        </button>

        <BlockMeta blockId={block.id} />

      </aside>
      </div>

      <SimilarGrid block={block} />
    </div>
  )
}

/** Les blocs qui ressemblent le plus à celui-ci (un carrousel est comparé par sa première image), en grille comme la page « Tout ». */
function SimilarGrid({ block }: { block: GridBlock }) {
  const { blocks, open, thumbsDir, size } = useGrid()
  const [ids, setIds] = useState<string[]>([])
  const [width, setWidth] = useState(0)
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setIds([])
    void getSearchIndex().then((index) => {
      if (cancelled) return
      const j = index.rels.indexOf(block.rel)
      if (j < 0 || !index.dim) return
      const query = index.matrix.subarray(j * index.dim, (j + 1) * index.dim)
      setIds(nearestBlocks(query, index.matrix, index.dim, index.blockOf, index.ids, block.id, 60).map((n) => n.id))
    })
    return () => {
      cancelled = true
    }
  }, [block.id, block.rel])

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ids.length > 0])

  const byId = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks])
  const similar = useMemo(() => ids.map((id) => byId.get(id)).filter((b): b is GridBlock => !!b), [ids, byId])
  const layout = useMemo(() => layoutMasonry(similar.map((b) => b.ratio), Math.max(width, 1), size, 12), [similar, width, size])
  if (similar.length === 0) return null

  return (
    <div className="px-4 pb-8 pt-6">
      <div className="mb-3 text-center text-base font-semibold">Images similaires</div>
      <div ref={wrap} className="relative" style={{ height: width > 50 ? layout.height : 0 }}>
        {width > 50 && similar.map((b, i) => (
          <Tile key={b.id} block={b} place={layout.items[i]} thumbsDir={thumbsDir} videoSrc={null} selected={false} onClick={(_e, id) => open(id)} onHover={() => undefined} onMenu={(x, y, id) => setMenu({ x, y, id })} />
        ))}
      </div>
      {menu && <BlockMenu x={menu.x} y={menu.y} blockIds={[menu.id]} onClose={() => setMenu(null)} />}
    </div>
  )
}

/** Les collections du bloc : l'origine (tableau Pinterest ou Instagram) et mes collections, où l'on peut le ranger ou le retirer. */
function BlockCollections({ blockId }: { blockId: string }) {
  const { cards, add, removeBlock } = useCollections()
  const [ids, setIds] = useState<string[]>([])
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null)

  const reload = () => void loadBlockCollectionIds(blockId).then(setIds)
  useEffect(() => {
    let cancelled = false
    void loadBlockCollectionIds(blockId).then((r) => {
      if (!cancelled) setIds(r)
    })
    return () => {
      cancelled = true
    }
  }, [blockId, cards])

  const mine = manualCollections(cards)
  const inMine = mine.filter((c) => ids.includes(c.id))
  const origin = cards.filter((c) => c.kind !== 'manual' && ids.includes(c.id))

  return (
    <div className="mt-7">
      <div className="lib-count mb-2">Collections</div>
      {origin.length > 0 && (
        <div className="mb-1.5 text-sm" style={{ color: 'var(--fg-muted)' }}>
          {origin.map((c) => (c.kind === 'instagram' ? `@${c.name}` : c.name)).join(', ')}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {inMine.map((c) => (
          <button
            key={c.id}
            className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs"
            style={{ background: 'var(--accent)', color: '#fff' }}
            title="Cliquer pour retirer de cette collection"
            onClick={() => void removeBlock(c.id, blockId).then(reload)}
          >
            {collectionPath(cards, c.id)} <X size={11} />
          </button>
        ))}
      </div>
      <button
        className="btn mt-2 w-full justify-between"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setPicker({ x: r.left - 340, y: r.top - 200 })
        }}
      >
        Ajouter à une collection…
      </button>
      {picker && (
        <PickerPopover
          x={picker.x}
          y={picker.y}
          blockIds={[blockId]}
          onClose={() => setPicker(null)}
          onPick={(id) => void add(id, [blockId]).then(() => { setPicker(null); reload() })}
        />
      )}
    </div>
  )
}

/** Moodboards de Form : ceux qui contiennent déjà une image de ce bloc, et ajouter ce bloc à un moodboard (existant ou nouveau). */
function BlockMoodboards({ block }: { block: GridBlock }) {
  const boards = useFormBoards()
  const [naming, setNaming] = useState(false)
  const [containing, setContaining] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    void boardsContaining(block.id).then((ids) => {
      if (!cancelled) setContaining(ids)
    })
    return () => {
      cancelled = true
    }
  }, [block.id, tick])

  const add = async (boardId: string, name: string) => {
    setBusy(true)
    try {
      const { added, failed } = await addBlocksToBoard(boardId, [block])
      useToast.getState().show(addedMessage(added, failed, name))
    } catch (e) {
      useToast.getState().show(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
    setTick((t) => t + 1)
  }
  const inBoards = boards.filter((b) => containing.includes(b.id))
  return (
    <div className="mt-7">
      <div className="lib-count mb-2">Moodboard</div>
      {inBoards.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs" style={{ color: 'var(--fg-muted)' }}>
          Dans :
          {inBoards.map((b) => (
            <button
              key={b.id}
              className="rounded border px-1.5 py-0.5 hover:bg-[var(--bg-hover)]"
              style={{ borderColor: 'var(--border)', color: 'var(--fg)' }}
              onClick={() => {
                useGrid.getState().open(null)
                useApp.getState().select(b.id)
              }}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}
      {boards.length > 0 && (
        <select
          value=""
          disabled={busy}
          onChange={(e) => {
            const m = boards.find((c) => c.id === e.target.value)
            if (m) void add(m.id, m.name)
          }}
          className="lib-input w-full rounded-xl border px-3 py-2 text-sm outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
          aria-label="Ajouter à un moodboard"
        >
          <option value="">Ajouter à un moodboard…</option>
          {boards.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}
      {naming ? (
        <NameInput className="mt-2" placeholder="Nom du moodboard" confirmLabel="Créer" onCancel={() => setNaming(false)} onSubmit={(name) => void createBoard(name).then((id) => add(id, name.trim() || 'Moodboard')).then(() => setNaming(false))} />
      ) : (
        null
      )}
    </div>
  )
}

/** Les couleurs dominantes de l'image affichée ; un clic copie le code de la couleur (#RRGGBB). */
function ColorPalette({ rel }: { rel: string }) {
  const [swatches, setSwatches] = useState<Swatch[]>([])
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadFileColors(rel).then((s) => {
      if (!cancelled) setSwatches(s)
    })
    return () => {
      cancelled = true
    }
  }, [rel])

  if (swatches.length === 0) return null
  const copy = (hex: string) => {
    const code = `#${hex.toUpperCase()}`
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(code)
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500)
    })
  }
  return (
    <div className="mt-7">
      <div className="lib-count mb-2">Couleurs</div>
      <div className="flex overflow-hidden rounded-xl">
        {swatches.map((s) => (
          <button
            key={s.hex}
            className="h-9"
            style={{ background: `#${s.hex}`, flexGrow: Math.max(s.pct, 8), flexBasis: 0 }}
            title={`#${s.hex.toUpperCase()} (${s.pct} %) : cliquer pour copier`}
            aria-label={`Copier #${s.hex.toUpperCase()}`}
            onClick={() => copy(s.hex)}
          />
        ))}
      </div>
      <div className="mt-1 h-4 text-xs" style={{ color: 'var(--fg-muted)' }}>{copied ? `${copied} copié` : 'Cliquer sur une couleur pour copier son code'}</div>
    </div>
  )
}

const ORIGIN_HINT = { board: 'Vient de ton tableau Pinterest', manual: 'Ajouté à la main' } as const

function originHint(t: BlockType): string {
  if (t.origin !== 'auto') return ORIGIN_HINT[t.origin]
  return t.score === null ? 'Rangé dans « Autres » : cette image n\'est dans aucun de tes tableaux' : `Reconnu par l'IA (confiance ${Math.round(t.score * 100)} %)`
}

/** Types d'image d'un bloc : ceux de ses tableaux, ceux de l'IA, ceux qu'on ajoute à la main. */
function BlockTypes({ blockId }: { blockId: string }) {
  const loadTypes = useGrid((s) => s.loadTypes)
  const allTypes = useGrid((s) => s.typeIndex.types)
  const [types, setTypes] = useState<BlockType[]>([])
  const [draft, setDraft] = useState('')

  useEffect(() => {
    let cancelled = false
    void loadBlockTypes(blockId).then((t) => {
      if (!cancelled) setTypes(t)
    })
    return () => {
      cancelled = true
    }
  }, [blockId])

  const refresh = async () => {
    setTypes(await loadBlockTypes(blockId))
    await loadTypes()
  }
  const commit = async (value: string) => {
    if (!value.trim()) return
    await addBlockType(blockId, value)
    setDraft('')
    await refresh()
  }

  return (
    <div>
      <div className="lib-count mb-2">Types d'image</div>
      <div className="flex flex-wrap gap-1.5">
        {types.length === 0 && <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>Aucun type</span>}
        {types.map((t) => (
          <button
            key={t.id}
            className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs"
            style={{ background: t.origin === 'auto' ? 'var(--bg-hover)' : 'var(--accent)', color: t.origin === 'auto' ? 'var(--fg)' : '#fff' }}
            title={`${originHint(t)} — cliquer pour retirer`}
            onClick={() => void removeBlockType(blockId, t.id).then(refresh)}
          >
            {t.name} {t.origin === 'auto' && <span className="opacity-60">IA</span>} <X size={11} />
          </button>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void commit(draft)
        }}
        list="type-suggestions"
        placeholder="Ajouter un type, puis Entrée"
        className="lib-input mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none"
        style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
        aria-label="Ajouter un type"
      />
      <datalist id="type-suggestions">
        {allTypes.map((t) => <option key={t.id} value={t.name} />)}
      </datalist>
    </div>
  )
}

/** Types d'image et note perso d'un bloc (la note s'enregistre toute seule). */
function BlockMeta({ blockId }: { blockId: string }) {
  const [note, setNote] = useState('')
  const [ready, setReady] = useState(false)
  const dirty = useRef(false)
  const latest = useRef('')

  useEffect(() => {
    let cancelled = false
    void loadNote(blockId).then((n) => {
      if (cancelled) return
      setNote(n)
      latest.current = n
      setReady(true)
    })
    return () => {
      cancelled = true
      // On enregistre la note en partant (changement de bloc ou fermeture).
      if (dirty.current) void saveNote(blockId, latest.current)
    }
  }, [blockId])

  // Enregistrement automatique, un instant après la dernière frappe.
  useEffect(() => {
    if (!dirty.current) return
    const timer = setTimeout(() => {
      dirty.current = false
      void saveNote(blockId, latest.current)
    }, 700)
    return () => clearTimeout(timer)
  }, [note, blockId])

  if (!ready) return null
  return (
    <div className="mt-6 flex flex-col gap-5">
      <BlockTypes blockId={blockId} />
      <div>
        <div className="lib-count mb-2">Note</div>
        <textarea
          value={note}
          onChange={(e) => {
            dirty.current = true
            latest.current = e.target.value
            setNote(e.target.value)
          }}
          rows={4}
          placeholder="Une note perso sur ce bloc…"
          className="lib-input w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
          aria-label="Note"
        />
      </div>
    </div>
  )
}
function Notice({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-sm" style={{ color: 'var(--fg-muted)' }}>
      <ImageOff size={28} />
      {text}
    </div>
  )
}
