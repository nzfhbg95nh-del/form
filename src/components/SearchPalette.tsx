import { useEffect, useMemo, useRef, useState } from 'react'
import { Briefcase, Database, FilePlus2, FileText, Images, Rows3, Search, Users } from 'lucide-react'
import { searchBusiness } from '@/lib/business'
import { coverStyle } from '@/components/PagePickers'
import { extractText, groupByRecency, searchObjects, type SearchHit } from '@/lib/search'
import { parseBlockLink } from '@/lib/blocks'
import { parsePageLink } from '@/lib/windowActions'
import { useApp } from '@/store/app'
import type { ObjectRow } from '@/lib/types'
import { Icon } from '@/components/Icon'

type Entry =
  | { type: 'new'; id: 'new-page'; title: string }
  | { type: 'page'; id: string; title: string; object: ObjectRow; path: string }
  | { type: 'client'; id: string; title: string; subtitle: string }
  | { type: 'service'; id: string; title: string; subtitle: string }

const kbd = 'rounded border border-[var(--border)] px-1 text-[11px]'

function PageGlyph({ o }: { o: ObjectRow }) {
  if (o.icon) return <Icon value={o.icon} size={18} />
  if (o.type === 'database') return <Database size={16} />
  if (o.type === 'moodboard') return <Images size={16} />
  if (o.type === 'row') return <Rows3 size={16} />
  return <FileText size={16} />
}

export function SearchPalette() {
  const { objects, clients, services, select, show, setEditing, setSearch, searchNewTab, createPage } = useApp()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const list = useRef<HTMLDivElement>(null)

  const hits = useMemo<SearchHit[]>(() => {
    // Un lien copié avec « Copier le lien vers la page actuelle » ouvre directement la page.
    const linked = parsePageLink(query)
    const target = linked ? objects.find((o) => o.id === linked && !o.deleted_at) : undefined
    if (target) return [{ object: target, score: 100, snippet: null, path: [] }]
    return searchObjects(objects, query, query.trim() ? 30 : 40)
  }, [objects, query])
  const business = useMemo<Entry[]>(
    () => searchBusiness(clients, services, query).map((b) => ({ type: b.kind, id: b.id, title: b.title, subtitle: b.subtitle }) as Entry),
    [clients, services, query],
  )
  const toEntry = (h: SearchHit): Entry => ({ type: 'page', id: h.object.id, title: h.object.title || 'Sans titre', object: h.object, path: h.path.join(' / ') })

  // Affichage : sans recherche, « Nouvelle page » puis les pages récentes par date ; avec recherche, les résultats.
  const sections = useMemo(() => {
    if (query.trim() === '') return groupByRecency(hits, new Date()).map((g) => ({ label: g.label, entries: g.hits.map(toEntry) }))
    return [{ label: '', entries: [...hits.map(toEntry), ...business] }]
  }, [hits, business, query])
  const actions: Entry[] = query.trim() === '' ? [{ type: 'new', id: 'new-page', title: 'Nouvelle page' }] : []
  const flat = useMemo(() => [...actions, ...sections.flatMap((s) => s.entries)], [sections, query]) // eslint-disable-line react-hooks/exhaustive-deps
  const active = flat[index]

  useEffect(() => setIndex(0), [query])
  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const open = (entry: Entry | undefined, newTab: boolean) => {
    if (!entry) return
    setSearch(false)
    if (entry.type === 'new') void createPage(null, newTab)
    else if (entry.type === 'page') {
      select(entry.id, { newTab })
      // Lien vers un bloc précis : on fait défiler jusqu'à lui.
      const blockId = parseBlockLink(query)?.blockId
      if (blockId) window.setTimeout(() => document.querySelector(`[data-id="${blockId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 500)
    }
    else {
      show(entry.type === 'client' ? 'clients' : 'services')
      setEditing({ kind: entry.type, id: entry.id })
    }
  }

  const placeholder = searchNewTab ? 'Ouvrir dans un nouvel onglet…' : 'Rechercher une page, un client, un tarif, un mot…'
  let position = actions.length - 1

  const row = (e: Entry, i: number) => (
    <button
      key={e.type + e.id}
      data-active={i === index}
      onMouseEnter={() => setIndex(i)}
      onClick={(ev) => open(e, searchNewTab || ev.ctrlKey || ev.metaKey)}
      className={'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ' + (i === index ? 'bg-[var(--bg-hover)]' : '')}
    >
      <span className="flex w-5 shrink-0 justify-center text-base">
        {e.type === 'new' ? <FilePlus2 size={16} /> : e.type === 'client' ? <Users size={16} /> : e.type === 'service' ? <Briefcase size={16} /> : <PageGlyph o={e.object} />}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{e.title}</span>
        {e.type === 'page' && e.path && <span className="text-[var(--fg-muted)]"> — {e.path}</span>}
        {(e.type === 'client' || e.type === 'service') && <span className="text-[var(--fg-muted)]"> — {e.subtitle}</span>}
      </span>
    </button>
  )

  const preview = () => {
    if (!active) return <div className="p-6 text-sm text-[var(--fg-muted)]">Aucun résultat.</div>
    if (active.type === 'new') return <div className="p-6 text-sm text-[var(--fg-muted)]">Crée une page vide{searchNewTab ? ' dans un nouvel onglet' : ''}.</div>
    if (active.type === 'client' || active.type === 'service') {
      return <div className="p-6"><div className="mb-1 text-xl font-semibold">{active.title}</div><div className="text-sm text-[var(--fg-muted)]">{active.subtitle}</div></div>
    }
    const o = active.object
    const text = extractText(o.content).slice(0, 700)
    const kids = o.type === 'database' ? objects.filter((x) => x.parent_id === o.id && x.type === 'row' && !x.deleted_at).length : 0
    return (
      <div>
        {o.cover ? <div className="h-24 w-full" style={coverStyle(o.cover)} /> : <div className="h-14 w-full bg-[var(--bg-side)]" />}
        <div className="px-6 pb-4">
          <div className="-mt-5 mb-2 flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg)] text-2xl shadow-sm"><PageGlyph o={o} /></div>
          <div className="mb-1 text-lg font-semibold">{o.title || 'Sans titre'}</div>
          {active.path && <div className="mb-2 text-xs text-[var(--fg-muted)]">{active.path}</div>}
          {o.type === 'database' && <div className="text-sm text-[var(--fg-muted)]">Base de données · {kids} ligne{kids > 1 ? 's' : ''}</div>}
          {o.type === 'moodboard' && <div className="text-sm text-[var(--fg-muted)]">Moodboard</div>}
          {text && <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--fg-muted)]">{text}{text.length >= 700 ? '…' : ''}</p>}
          {!text && o.type === 'page' && <p className="text-sm text-[var(--fg-muted)]">Page vide.</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[6vh]" onMouseDown={() => setSearch(false)}>
      <div
        className="flex h-[78vh] w-[1000px] max-w-[96vw] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <Search size={20} className="text-[var(--fg-muted)]" />
          <input
            autoFocus
            value={query}
            placeholder={placeholder}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSearch(false)
              else if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, flat.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
              else if (e.key === 'Enter') open(active, searchNewTab || e.ctrlKey || e.metaKey)
            }}
            className="flex-1 bg-transparent text-lg outline-none placeholder:text-[var(--fg-muted)]"
          />
        </div>

        <div className="flex min-h-0 flex-1">
          <div ref={list} className="min-w-0 flex-1 overflow-y-auto p-3">
            {actions.map((a, i) => row(a, i))}
            {sections.map((s) => (
              <div key={s.label || 'results'}>
                {s.label && <div className="px-3 pb-1 pt-4 text-xs font-medium text-[var(--fg-muted)]">{s.label}</div>}
                {s.entries.map((e) => row(e, ++position))}
              </div>
            ))}
            {flat.length === 0 && <div className="px-3 py-6 text-sm text-[var(--fg-muted)]">Aucun résultat.</div>}
          </div>
          <div className="hidden w-[380px] shrink-0 overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-side)] md:block">{preview()}</div>
        </div>

        <div className="flex items-center gap-5 border-t border-[var(--border)] px-5 py-2.5 text-xs text-[var(--fg-muted)]">
          <span><span className={kbd}>↵</span> Ouvrir</span>
          <span><span className={kbd}>Ctrl</span>+<span className={kbd}>↵</span> Ouvrir dans un nouvel onglet</span>
          <span><span className={kbd}>↑</span> <span className={kbd}>↓</span> Naviguer</span>
          <span><span className={kbd}>Échap</span> Fermer</span>
        </div>
      </div>
    </div>
  )
}
