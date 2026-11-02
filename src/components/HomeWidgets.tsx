// Les widgets de l'accueil liés à la bibliothèque, aux moodboards, aux recettes et aux factures.

import { useEffect, useMemo, useState } from 'react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { ImagePlus, Shuffle } from 'lucide-react'
import { RecipeCard } from '@/components/RecipesView'
import { addFiles, addPaths, ALLOWED_EXT } from '@/biblio/lib/ajouts'
import { getDb } from '@/biblio/lib/db'
import { blockLabel, memories, randomBlock, thumbUrl, triageStats, type HomeBlock, type TriageStats } from '@/biblio/lib/homeData'
import { openTarget, UNSORTED } from '@/biblio/lib/collections'
import { imagesLabel, listBoards, type BoardCard } from '@/biblio/lib/moodboardList'
import { useGrid } from '@/biblio/store/grid'
import { useLibraryNav } from '@/biblio/store/nav'
import { todayISO } from '@/lib/backup'
import { clientDisplayName, formatEuros } from '@/lib/business'
import { parseSchema } from '@/lib/database'
import { receivables } from '@/lib/payments'
import { useApp } from '@/store/app'

const none = (text: string) => <p className="text-sm text-[var(--fg-muted)]">{text}</p>

/** Ouvre une image de la bibliothèque dans la vue détail (en chargeant la bibliothèque si elle ne l'est pas encore). */
async function openBlock(id: string) {
  const g = useGrid.getState()
  if (!g.loaded) await g.load()
  useGrid.getState().open(id)
}

/** L'adresse de la miniature d'une image, une fois lue. */
function useThumbUrl(thumb: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void thumbUrl(thumb ?? null).then((u) => { if (!cancelled) setUrl(u) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [thumb])
  return url
}

function Picture({ block, className = '' }: { block: HomeBlock; className?: string }) {
  const url = useThumbUrl(block.thumb)
  return (
    <button
      data-lift
      onClick={() => void openBlock(block.id)}
      className={'overflow-hidden rounded-2xl bg-[var(--bg-hover)] shadow-[var(--shadow-soft)] ' + className}
      title={blockLabel(block)}
      aria-label={`Ouvrir l'image : ${blockLabel(block)}`}
    >
      {url && <img src={url} alt="" draggable={false} className="h-full w-full object-cover" />}
    </button>
  )
}

// ── Image du jour ──
export function InspirationWidget() {
  const [block, setBlock] = useState<HomeBlock | null | undefined>(undefined)
  const draw = async (not?: string | null) => setBlock(await randomBlock(not).catch(() => null))
  useEffect(() => { void draw() }, [])
  if (block === undefined) return none('…')
  if (block === null) return none('Ta bibliothèque n’a pas encore d’image prête.')
  return (
    <div className="flex items-center gap-5">
      <Picture block={block} className="h-48" />
      <div className="flex min-w-0 flex-col items-start gap-2">
        <div className="lib-count">Tirée au hasard</div>
        <div className="max-w-xs truncate text-sm font-medium">{blockLabel(block)}</div>
        <button className="btn" onClick={() => void draw(block.id)}><Shuffle size={14} /> Une autre</button>
      </div>
    </div>
  )
}

// ── Moodboards récents ──
async function boardPreview(b: BoardCard): Promise<string | null> {
  const db = await getDb()
  const pick = (r: { thumb_url: string | null; data_url: string }) => r.thumb_url || r.data_url
  if (b.coverAsset) {
    const rows = await db.select<{ thumb_url: string | null; data_url: string }[]>('SELECT thumb_url, data_url FROM board_assets WHERE board_id = $1 AND id = $2', [b.id, b.coverAsset])
    if (rows[0]) return pick(rows[0])
  }
  const rows = await db.select<{ thumb_url: string | null; data_url: string }[]>('SELECT thumb_url, data_url FROM board_assets WHERE board_id = $1 ORDER BY created_at DESC LIMIT 1', [b.id])
  return rows[0] ? pick(rows[0]) : null
}

export function RecentBoardsWidget() {
  const objects = useApp((s) => s.objects)
  const select = useApp((s) => s.select)
  const boards = useMemo(() => [...listBoards(objects)].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 4), [objects])
  const key = boards.map((b) => b.id + b.updatedAt + (b.coverAsset ?? '')).join('|')
  const [previews, setPreviews] = useState<Record<string, string | null>>({})
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next: Record<string, string | null> = {}
      for (const b of boards) next[b.id] = await boardPreview(b).catch(() => null)
      if (!cancelled) setPreviews(next)
    })()
    return () => { cancelled = true }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (boards.length === 0) return none('Aucun moodboard pour le moment.')
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {boards.map((b) => (
        <button key={b.id} data-lift onClick={() => select(b.id)} className="flex flex-col gap-2 text-left" title={b.name}>
          <div
            className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[var(--bg-hover)] shadow-[var(--shadow-soft)]"
            style={previews[b.id] ? { backgroundImage: `url("${previews[b.id]}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          />
          <div className="min-w-0 px-0.5">
            <div className="truncate text-sm font-medium">{b.name}</div>
            <div className="truncate text-xs text-[var(--fg-muted)]">{imagesLabel(b.images)}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

// ── À trier ──
export function TriageWidget() {
  const [stats, setStats] = useState<TriageStats | null>(null)
  useEffect(() => { void triageStats().then(setStats).catch(() => undefined) }, [])
  if (!stats) return none('…')
  const go = () => {
    useLibraryNav.getState().go('all')
    useGrid.getState().setFilters({ collection: openTarget({ id: UNSORTED, name: 'À trier', parentId: null }) })
    useApp.getState().show('library')
  }
  return (
    <div className="flex items-center gap-6 rounded-2xl border border-[var(--border)] p-4 shadow-[var(--shadow-soft)]">
      <div>
        <div className="text-3xl font-semibold tracking-tight tabular-nums">{stats.unsorted.toLocaleString('fr-FR')}</div>
        <div className="lib-count mt-1">{stats.unsorted > 1 ? 'images à trier' : 'image à trier'}</div>
      </div>
      <div className="min-w-0 flex-1 text-sm text-[var(--fg-muted)]">
        {stats.unsorted === 0 ? 'Tout est rangé.' : 'Elles ne sont dans aucune de tes collections.'}
        {stats.addedWeek > 0 && <div className="mt-0.5">{stats.addedWeek} ajoutée{stats.addedWeek > 1 ? 's' : ''} à la main cette semaine.</div>}
      </div>
      {stats.unsorted > 0 && <button className="btn btn-primary" onClick={go}>Trier</button>}
    </div>
  )
}

// ── Il y a un an ──
export function MemoriesWidget() {
  const [items, setItems] = useState<(HomeBlock & { years: number })[] | null>(null)
  useEffect(() => { void memories().then(setItems).catch(() => setItems([])) }, [])
  if (items === null) return none('…')
  if (items.length === 0) return none('Pas de souvenir pour cette période : rien d’enregistré à cette date les années passées.')
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]">
      {items.map((m) => (
        <div key={m.id} className="flex w-36 shrink-0 flex-col gap-1.5">
          <Picture block={m} className="h-44 w-36" />
          <div className="min-w-0 px-0.5">
            <div className="lib-count">il y a {m.years} an{m.years > 1 ? 's' : ''}</div>
            <div className="truncate text-xs text-[var(--fg-muted)]">{blockLabel(m)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Dépôt rapide ──
export function QuickDropWidget() {
  const [over, setOver] = useState(false)
  const pick = async () => {
    const picked = await openDialog({ multiple: true, filters: [{ name: 'Images et vidéos', extensions: [...ALLOWED_EXT] }] }).catch(() => null)
    if (picked) await addPaths(Array.isArray(picked) ? picked : [picked])
  }
  return (
    <div
      className={'flex items-center gap-4 rounded-2xl border border-dashed p-5 transition-colors ' + (over ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]' : 'border-[var(--border)]')}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); if (e.dataTransfer.files.length > 0) { e.preventDefault(); void addFiles(Array.from(e.dataTransfer.files)) } }}
    >
      <ImagePlus size={26} className="shrink-0 text-[var(--fg-muted)]" />
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-medium">Dépose des images ici</div>
        <div className="text-xs text-[var(--fg-muted)]">Elles sont copiées dans « images ajoutées » de ta bibliothèque, sans doublon, et l’IA les range dans la bonne collection.</div>
      </div>
      <button className="btn" onClick={() => void pick()}>Choisir…</button>
    </div>
  )
}

// ── Recette du jour ──
export function RecipeOfDayWidget() {
  const objects = useApp((s) => s.objects)
  const rows = useMemo(() => {
    const db = objects.find((o) => o.type === 'database' && !o.deleted_at && parseSchema(o.properties).kind === 'recipes')
    return db ? objects.filter((o) => o.type === 'row' && o.parent_id === db.id && !o.deleted_at) : []
  }, [objects])
  const [pick, setPick] = useState(0)
  useEffect(() => { setPick(Math.floor(Math.random() * Math.max(1, rows.length))) }, [rows.length])
  if (rows.length === 0) return none('Aucune recette pour le moment.')
  const row = rows[pick % rows.length]
  return (
    <div className="flex items-center gap-5">
      <div className="w-52 shrink-0"><RecipeCard row={row} tall /></div>
      <div className="flex flex-col items-start gap-2">
        <div className="lib-count">{rows.length} recettes</div>
        <button className="btn" onClick={() => setPick((p) => (rows.length > 1 ? (p + 1 + Math.floor(Math.random() * (rows.length - 1))) % rows.length : 0))}><Shuffle size={14} /> Une autre</button>
      </div>
    </div>
  )
}

// ── Factures en retard ──
export function LateInvoicesWidget() {
  const { invoices, invoiceLines, payments, clients } = useApp()
  const today = todayISO()
  const late = useMemo(() => receivables(invoices, invoiceLines, payments, today).filter((r) => r.daysLate > 0).slice(0, 5), [invoices, invoiceLines, payments, today])
  if (late.length === 0) return none('Aucune facture en retard.')
  return (
    <div className="flex flex-col gap-1">
      {late.map((r) => {
        const client = clients.find((c) => c.id === r.invoice.client_id)
        return (
          <button
            key={r.invoice.id}
            onClick={() => { useApp.getState().show('invoices'); useApp.getState().openInvoice(r.invoice.id) }}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--bg-hover)]"
          >
            <span className="w-28 shrink-0 font-medium">{r.invoice.number}</span>
            <span className="min-w-0 flex-1 truncate text-[var(--fg-muted)]">{client ? clientDisplayName(client) : '—'}</span>
            <span className="tabular-nums">{formatEuros(r.remaining)}</span>
            <span className="w-28 shrink-0 text-right text-xs text-red-500">{r.daysLate} jour{r.daysLate > 1 ? 's' : ''} de retard</span>
          </button>
        )
      })}
    </div>
  )
}
