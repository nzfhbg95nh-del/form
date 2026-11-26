// Glisser des images de « Tout » pour les ranger : une petite vignette suit la souris, une barre monte du bas avec les collections,
// les moodboards et la corbeille ; lâcher sur une case range les images, lâcher ailleurs ne fait rien.
// La première fois, une carte d'aide illustrée explique les gestes (elle se revoit avec le bouton « ? »).

import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderPlus, Images, LayoutGrid, Trash2 } from 'lucide-react'
import { HelpCard, Joiner, KeyCap, MouseIcon, type HelpStep } from '@/components/HelpCard'
import { addBlocksToBoard, addedMessage, useFormBoards } from '@/biblio/lib/formBoards.ts'
import { getSetting, setSetting } from '@/biblio/lib/library.ts'
import { fileUrl, thumbPath } from '@/biblio/lib/media.ts'
import type { GridBlock } from '@/biblio/lib/blocks.ts'
import { useCollections } from '@/biblio/store/collections.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { useToast } from '@/biblio/store/toast.ts'
import { useTrash } from '@/biblio/store/trash.ts'
import { useApp } from '@/store/app'

/** Distance (px) à parcourir avant que l'appui devienne un glisser : en dessous, c'est un clic. */
const THRESHOLD = 6
const RECENT_KEY = 'form-drop-recent'
const HELP_KEY = 'help_drag_seen'

export interface DragState { ids: string[]; thumb: string | null; x: number; y: number; over: string | null }

/** Les collections où l'on a déposé récemment, de la plus récente à la plus ancienne. */
function recentTargets(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[] } catch { return [] }
}
function remember(key: string) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([key, ...recentTargets().filter((k) => k !== key)].slice(0, 12))) } catch { /* sans importance */ }
}

/** Les gestes de la bibliothèque, pour la carte d'aide. */
export const DRAG_HELP: HelpStep[] = [
  { art: <><MouseIcon button="left" drag /></>, title: 'Ranger', text: 'Clique sur une image, garde appuyé et glisse-la sur une collection ou un moodboard de la barre du bas.' },
  { art: <><KeyCap>Ctrl</KeyCap><Joiner>+</Joiner><MouseIcon button="left" /></>, title: 'Plusieurs à la fois', text: 'Ctrl + clic (ou Maj + clic pour une suite) sélectionne plusieurs images : glisse-en une, toutes suivent.' },
  { art: <MouseIcon button="right" />, title: 'Plus d’options', text: 'Clic droit sur une image : ajouter à une collection ou un moodboard, couverture, corbeille.' },
  { art: <><MouseIcon cross /><Joiner>ou</Joiner><KeyCap>Échap</KeyCap></>, title: 'Annuler', text: 'Lâche l’image ailleurs que sur la barre, ou appuie sur Échap : rien ne bouge.' },
]

/**
 * Le glisser des images de la grille. `onTilePointerDown` se branche sur chaque vignette ; `consumeClick` dit si le clic qui suit
 * un glisser doit être ignoré. `onPick` : « Autre collection… » (on ouvre la liste complète à l'endroit du dépôt).
 */
export function useBlockDrag({ blocks, thumbsDir, onPick }: { blocks: GridBlock[]; thumbsDir: string; onPick: (x: number, y: number, ids: string[]) => void }) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const [help, setHelp] = useState<'off' | 'drag' | 'open'>('off')
  const pending = useRef<{ id: string; x: number; y: number } | null>(null)
  const skipClick = useRef(false)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks

  const drop = async (target: string, ids: string[], x: number, y: number) => {
    const picked = blocksRef.current.filter((b) => ids.includes(b.id))
    try {
      if (target === 'trash') await useTrash.getState().trash(ids)
      else if (target === 'pick') onPick(x, y, ids)
      else if (target.startsWith('col:')) {
        await useCollections.getState().add(target.slice(4), ids)
        remember(target)
      } else if (target.startsWith('board:')) {
        const boardId = target.slice(6)
        const name = useApp.getState().objects.find((o) => o.id === boardId)?.title || 'Moodboard'
        const { added, failed } = await addBlocksToBoard(boardId, picked)
        useToast.getState().show(addedMessage(added, failed, name))
        remember(target)
      }
      if (target !== 'pick') useGrid.getState().clearSelection()
    } catch (e) {
      useToast.getState().show(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    const targetAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-drop]') as HTMLElement | null)?.dataset.drop ?? null
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (d) {
        setDrag({ ...d, x: e.clientX, y: e.clientY, over: targetAt(e.clientX, e.clientY) })
        return
      }
      const p = pending.current
      if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) < THRESHOLD) return
      pending.current = null
      const selected = useGrid.getState().selected
      const ids = selected.has(p.id) ? [...selected] : [p.id]
      const first = blocksRef.current.find((b) => b.id === p.id)
      setDrag({ ids, thumb: first?.thumb ?? null, x: e.clientX, y: e.clientY, over: null })
      document.documentElement.classList.add('form-block-dragging')
      // La première fois, la carte d'aide apparaît au-dessus de la barre.
      void getSetting(HELP_KEY).then((seen) => { if (!seen) setHelp('drag') }).catch(() => undefined)
    }
    const end = (e: PointerEvent | null) => {
      pending.current = null
      const d = dragRef.current
      if (!d) return
      document.documentElement.classList.remove('form-block-dragging')
      skipClick.current = true
      setTimeout(() => { skipClick.current = false }, 0)
      setDrag(null)
      const target = e ? targetAt(e.clientX, e.clientY) : null
      if (target) void drop(target, d.ids, e!.clientX, e!.clientY)
    }
    const onUp = (e: PointerEvent) => end(e)
    const onCancel = () => end(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && dragRef.current) end(null) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const closeHelp = () => {
    setHelp('off')
    void setSetting(HELP_KEY, '1').catch(() => undefined)
  }

  return {
    drag,
    onTilePointerDown: (e: React.PointerEvent, id: string) => {
      if (e.button !== 0) return
      pending.current = { id, x: e.clientX, y: e.clientY }
    },
    consumeClick: () => skipClick.current,
    help,
    openHelp: () => setHelp('open'),
    closeHelp,
    overlay: (
      <>
        {drag && <DropDock over={drag.over} count={drag.ids.length} />}
        {drag && <Ghost drag={drag} thumbsDir={thumbsDir} />}
        {help !== 'off' && (
          <div className="fixed inset-x-0 z-[61] flex justify-center px-4" style={{ bottom: help === 'drag' ? 168 : 32 }}>
            <HelpCard steps={DRAG_HELP} inert={!!drag} onClose={closeHelp} />
          </div>
        )}
      </>
    ),
  }
}

/** La vignette qui suit la souris, avec le nombre d'images quand il y en a plusieurs. */
function Ghost({ drag, thumbsDir }: { drag: DragState; thumbsDir: string }) {
  return (
    <div className="pointer-events-none fixed z-[70]" style={{ left: drag.x + 14, top: drag.y + 14 }}>
      <div className="relative h-20 w-20 rotate-[-4deg] overflow-hidden rounded-xl border-2 border-white" style={{ boxShadow: 'var(--shadow-lift)', background: 'var(--bg-hover)' }}>
        {drag.thumb && thumbsDir && <img src={fileUrl(thumbPath(thumbsDir, drag.thumb))} alt="" className="h-full w-full object-cover" draggable={false} />}
      </div>
      {drag.ids.length > 1 && <span className="absolute -right-2 -top-2 rounded-full bg-[var(--accent)] px-2 text-xs font-semibold leading-5 text-white tabular-nums">{drag.ids.length}</span>}
    </div>
  )
}

/** Une case de la barre de dépôt. */
function Target({ id, over, label, name, thumb, icon, danger = false }: { id: string; over: string | null; label: string; name?: string; thumb?: string | null; icon?: React.ReactNode; danger?: boolean }) {
  const thumbsDir = useGrid((s) => s.thumbsDir)
  const on = over === id
  const tone = danger ? '#d44c47' : 'var(--accent)'
  return (
    <div
      data-drop={id}
      data-name={name ?? label}
      className="flex w-28 shrink-0 flex-col items-center gap-1.5 rounded-xl p-2 text-center transition-all duration-150"
      style={{ background: on ? `color-mix(in srgb, ${tone} 14%, transparent)` : 'transparent', transform: on ? 'scale(1.06)' : undefined, outline: on ? `2px solid ${tone}` : 'none' }}
    >
      <div className="flex h-14 w-full items-center justify-center overflow-hidden rounded-lg" style={{ background: 'var(--bg-hover)', color: danger ? tone : 'var(--fg-muted)' }}>
        {thumb && thumbsDir ? <img src={fileUrl(thumbPath(thumbsDir, thumb))} alt="" className="h-full w-full object-cover" draggable={false} /> : icon}
      </div>
      <span className="w-full truncate text-xs" style={{ color: danger && on ? tone : undefined }}>{label}</span>
    </div>
  )
}

/** La barre qui monte du bas pendant le glisser. */
export function DropDock({ over, count }: { over: string | null; count: number }) {
  const cards = useCollections((s) => s.cards)
  const boards = useFormBoards()
  const collections = useMemo(() => {
    const recent = recentTargets()
    const rank = (id: string) => { const i = recent.indexOf(`col:${id}`); return i === -1 ? 999 : i }
    return cards.filter((c) => c.kind === 'manual').sort((a, b) => rank(a.id) - rank(b.id) || b.count - a.count).slice(0, 6)
  }, [cards])
  const recentBoards = useMemo(() => {
    const recent = recentTargets()
    const rank = (id: string) => { const i = recent.indexOf(`board:${id}`); return i === -1 ? 999 : i }
    return [...boards].sort((a, b) => rank(a.id) - rank(b.id)).slice(0, 3)
  }, [boards])
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4">
      <div className="form-dock pointer-events-auto flex max-w-full items-stretch gap-1 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-2" style={{ boxShadow: 'var(--shadow-lift)' }}>
        <div className="flex flex-col justify-center px-2 text-xs text-[var(--fg-muted)]">
          <span className="font-medium text-[var(--fg)]">{count > 1 ? `${count} images` : '1 image'}</span>
          <span>Lâche sur une case</span>
        </div>
        {collections.map((c) => <Target key={c.id} id={`col:${c.id}`} over={over} label={c.name} thumb={c.previews[0] ?? null} icon={<Images size={20} />} />)}
        <Target id="pick" over={over} label="Autre collection…" icon={<FolderPlus size={20} />} />
        {recentBoards.length > 0 && <div className="mx-1 w-px self-stretch" style={{ background: 'var(--border)' }} />}
        {recentBoards.map((b) => <Target key={b.id} id={`board:${b.id}`} over={over} label={b.name} icon={<LayoutGrid size={20} />} />)}
        <div className="mx-1 w-px self-stretch" style={{ background: 'var(--border)' }} />
        <Target id="trash" over={over} label="Corbeille" icon={<Trash2 size={20} />} danger />
      </div>
    </div>
  )
}
