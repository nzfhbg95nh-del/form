import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, ChefHat, ClipboardCopy, Clock, Flame, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { parseContent } from '@/lib/content'
import { newId, parseValues } from '@/lib/database'
import { displayTitle } from '@/lib/lastEdit'
import { buildSession, fmtMinutes, MEAL_PREPS_SETTING, parseSavedPreps, readSteps, suggestCompanions, suggestIdeas, type CandidateRecipe, type PrepRecipe, type SavedPrep } from '@/lib/mealPrep'
import { RECIPE } from '@/lib/recipes'
import { AISLES, buildShoppingList, shoppingLines } from '@/lib/shoppingList'
import type { ObjectRow } from '@/lib/types'
import { copyText } from '@/lib/windowActions'
import { askConfirm } from '@/lib/confirm'
import { useApp } from '@/store/app'
import { DishPicker } from '@/components/DishPicker'

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null }

/**
 * Mes meal preps : Victor choisit des plats, Form conseille ceux qui iraient bien avec (se gardent, ingrédients communs, saison, protéines),
 * puis le meal prep est enregistré avec sa fiche (séance de cuisine, courses, conservation) pour le refaire facilement.
 */
export function MyMealPreps({ rows, byId, onUse }: { rows: ObjectRow[]; byId: Map<string, ObjectRow>; onUse: (recipeIds: string[], people: number) => void }) {
  const repo = useApp((s) => s.repo)
  const select = useApp((s) => s.select)
  const [saved, setSaved] = useState<SavedPrep[]>([])
  const [loaded, setLoaded] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [portions, setPortions] = useState(4)
  const [name, setName] = useState('')
  const [picking, setPicking] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const month = new Date().getMonth() + 1

  useEffect(() => {
    void (repo?.getSetting(MEAL_PREPS_SETTING) ?? Promise.resolve(null)).then((raw) => { setSaved(parseSavedPreps(raw)); setLoaded(true) })
  }, [repo])
  const savedText = useRef<string | null>(null)
  useEffect(() => {
    if (!loaded || !repo) return
    const text = JSON.stringify(saved)
    if (savedText.current === null) { savedText.current = text; return }
    if (text === savedText.current) return
    savedText.current = text
    void repo.setSetting(MEAL_PREPS_SETTING, text)
  }, [saved, loaded, repo])

  const candidates = useMemo((): CandidateRecipe[] => rows.map((row) => {
    const blocks = parseContent(row.content) ?? []
    const t = parseValues(row.properties)[RECIPE.type]
    return { id: row.id, title: displayTitle(row.title), lines: shoppingLines(blocks).lines, steps: readSteps(blocks).steps, type: typeof t === 'string' ? t : null }
  }), [rows])
  const candById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates])
  const selected = picked.map((id) => candById.get(id)).filter((c): c is CandidateRecipe => !!c)
  const companions = useMemo(() => (selected.length > 0 ? suggestCompanions(selected, candidates, month) : []), [selected, candidates, month]) // eslint-disable-line react-hooks/exhaustive-deps
  const ideas = useMemo(() => (selected.length === 0 ? suggestIdeas(candidates, 3, month) : []), [selected.length, candidates, month])
  // Sans plat choisi : les plats des idées de meal prep, chacun avec ses raisons, comme point de départ.
  const starters = useMemo(() => {
    const seen = new Set<string>()
    return suggestIdeas(candidates, 6, month).flatMap((i) => i.ids).filter((id) => !seen.has(id) && seen.add(id)).slice(0, 6).map((id) => ({ id, reasons: ['se garde bien', 'de saison ou sans produit frais hors saison'] }))
  }, [candidates, month])

  const add = (id: string) => setPicked((p) => (p.includes(id) ? p : [...p, id]))
  const save = () => {
    if (picked.length === 0) return
    const prep: SavedPrep = { id: newId(), name: name.trim() || selected.map((s) => s.title.replace(/\s*\(.*\)\s*$/, '')).join(' + '), recipeIds: picked, portions, createdAt: new Date().toISOString() }
    setSaved((s) => [prep, ...s])
    setPicked([])
    setName('')
    setOpenId(prep.id)
  }

  const open = saved.find((p) => p.id === openId)
  if (open) return <PrepSheet prep={open} byId={byId} onBack={() => setOpenId(null)} onUse={onUse} onSelect={select}
    onRename={(n) => setSaved((s) => s.map((p) => (p.id === open.id ? { ...p, name: n } : p)))}
    onPortions={(n) => setSaved((s) => s.map((p) => (p.id === open.id ? { ...p, portions: n } : p)))}
    onDelete={async () => { if (await askConfirm(`Supprimer le meal prep « ${open.name} » ? Les recettes ne sont pas supprimées.`)) { setSaved((s) => s.filter((p) => p.id !== open.id)); setOpenId(null) } }} />

  return (
    <div className="max-w-4xl">
      {/* Composer */}
      <section className="mb-6 rounded-xl border border-[var(--border)] p-4">
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold"><ChefHat size={17} /> Créer un meal prep</h3>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span key={s.id} className="flex items-center gap-1 rounded-full bg-[var(--bg-side)] py-0.5 pl-2.5 pr-1 text-sm">
              {s.title}
              <button aria-label={`Retirer ${s.title}`} className="rounded-full p-0.5 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]" onClick={() => setPicked((p) => p.filter((x) => x !== s.id))}><X size={12} /></button>
            </span>
          ))}
          {selected.length === 0 && <span className="text-sm text-[var(--fg-muted)]">Choisis un premier plat : Form te proposera ceux qui iraient bien avec.</span>}
        </div>
        <button className="btn mb-3 flex items-center gap-1.5 !text-sm" onClick={() => setPicking(true)}><Plus size={14} /> Ajouter un plat</button>
        {picking && (
          <DishPicker
            rows={rows}
            title="Ajouter des plats au meal prep"
            subtitle={selected.length > 0 ? 'Proposés pour aller avec ta sélection : se gardent bien, ingrédients en commun, autre protéine, de saison.' : 'Des plats qui se gardent bien et sont de saison, pour commencer.'}
            suggestions={selected.length > 0 ? companions : starters}
            picked={picked}
            keepOpen
            onPick={add}
            onClose={() => setPicking(false)}
          />
        )}
        {companions.length > 0 && (
          <div className="mb-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><Sparkles size={14} /> Iraient bien avec ta sélection</div>
            <ul className="space-y-1">
              {companions.map((c) => (
                <li key={c.id} className="flex items-start gap-2 rounded-md px-2 py-1 hover:bg-[var(--bg-hover)]">
                  <button className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--border)] hover:bg-[var(--bg-side)]" aria-label={`Ajouter ${c.title}`} onClick={() => add(c.id)}><Plus size={12} /></button>
                  <div className="min-w-0 flex-1">
                    <button className="text-left text-sm hover:underline" onClick={() => select(c.id)}>{c.title}</button>
                    <div className="text-xs text-[var(--fg-muted)]">{c.reasons.join(' · ')}</div>
                    {c.warning && <div className="text-xs" style={{ color: '#d9730d' }}>{c.warning}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {ideas.length > 0 && (
          <div className="mb-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><Sparkles size={14} /> Ou pars d’une idée</div>
            <div className="flex flex-wrap gap-2">
              {ideas.map((i) => (
                <button key={i.ids.join()} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-left text-xs hover:bg-[var(--bg-hover)]" onClick={() => setPicked(i.ids)}>
                  <div className="font-medium">{i.titles.map((t) => t.replace(/\s*\(.*\)\s*$/, '')).join(' + ')}</div>
                  <div className="text-[var(--fg-muted)]">{i.reasons.join(' · ')}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom (ex. Semaine indienne)" aria-label="Nom du meal prep" className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none" />
          <span className="text-sm text-[var(--fg-muted)]">portions par plat</span>
          <span className="flex items-center rounded-md border border-[var(--border)] text-sm">
            <button className="px-2" aria-label="Une portion de moins" onClick={() => setPortions((p) => Math.max(1, p - 1))}>−</button>
            <span className="min-w-[2rem] text-center tabular-nums">{portions}</span>
            <button className="px-2" aria-label="Une portion de plus" onClick={() => setPortions((p) => Math.min(30, p + 1))}>+</button>
          </span>
          <button className="btn btn-primary !text-sm" disabled={picked.length === 0} onClick={save}>Enregistrer ce meal prep</button>
        </div>
      </section>

      {/* Mes meal preps */}
      <h3 className="mb-2 text-base font-semibold">Mes meal preps</h3>
      {saved.length === 0 ? (
        <p className="text-sm text-[var(--fg-muted)]">Aucun pour l’instant : compose-en un ci-dessus.</p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {saved.map((p) => (
            <button key={p.id} className="rounded-xl border border-[var(--border)] p-3 text-left hover:bg-[var(--bg-hover)]" onClick={() => setOpenId(p.id)}>
              <div className="mb-1 font-medium">{p.name}</div>
              <div className="text-xs text-[var(--fg-muted)]">{p.recipeIds.map((id) => byId.get(id)).filter(Boolean).map((r) => displayTitle(r!.title).replace(/\s*\(.*\)\s*$/, '')).join(' · ')}</div>
              <div className="mt-1 text-xs text-[var(--fg-muted)]">{p.portions} portions par plat</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** La fiche d'un meal prep enregistré : tout pour le refaire (séance de cuisine, courses, conservation). */
function PrepSheet({ prep, byId, onBack, onUse, onSelect, onRename, onPortions, onDelete }: {
  prep: SavedPrep
  byId: Map<string, ObjectRow>
  onBack: () => void
  onUse: (ids: string[], people: number) => void
  onSelect: (id: string) => void
  onRename: (name: string) => void
  onPortions: (n: number) => void
  onDelete: () => void
}) {
  const [done, setDone] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const recipes = useMemo((): PrepRecipe[] => prep.recipeIds.map((id) => byId.get(id)).filter((r): r is ObjectRow => !!r).map((row) => {
    const blocks = parseContent(row.content) ?? []
    const read = shoppingLines(blocks)
    const steps = readSteps(blocks)
    const v = parseValues(row.properties)
    const base = read.servings ?? num(v[RECIPE.servings]) ?? 4
    return { id: row.id, title: displayTitle(row.title), lines: read.lines, factor: prep.portions / base, steps: steps.steps, variantSteps: read.variant ? steps.variantSteps : [], prep: num(v[RECIPE.prep]), cook: num(v[RECIPE.cook]), meals: [] }
  }), [prep, byId])
  const session = useMemo(() => buildSession(recipes), [recipes])
  const shopping = useMemo(() => buildShoppingList(recipes.map((r) => ({ recipe: r.title, lines: r.lines, factor: r.factor }))), [recipes])
  const toggle = (k: string) => setDone((d) => { const n = new Set(d); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const box = (k: string, text: string, sub?: string) => (
    <li key={k} className="flex items-start gap-2.5 rounded-md px-2 py-1 hover:bg-[var(--bg-hover)]">
      <button type="button" role="checkbox" aria-checked={done.has(k)} aria-label={text} onClick={() => toggle(k)} className={'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ' + (done.has(k) ? 'border-[#2383e2] bg-[#2383e2] text-white' : 'border-[var(--fg-muted)]')}>{done.has(k) && <Check size={12} strokeWidth={3} />}</button>
      <div className="min-w-0 flex-1"><div className={'text-sm ' + (done.has(k) ? 'text-[var(--fg-muted)] line-through' : '')}>{text}</div>{sub && <div className="text-xs text-[var(--fg-muted)]">{sub}</div>}</div>
    </li>
  )
  const sheetText = () => [
    prep.name, `${prep.portions} portions par plat · environ ${fmtMinutes(session.minutes)}`, '',
    'Plats', ...recipes.map((r) => `- ${r.title}`), '',
    'Courses', ...AISLES.flatMap((a) => { const l = shopping.filter((i) => i.aisle === a); return l.length ? [`${a}`, ...l.map((i) => `- ${i.text}`)] : [] }), '',
    'À lancer en premier', ...session.first.map((t) => `- ${t.text}`), '',
    'Mise en place commune', ...session.miseEnPlace.map((t) => `- ${t.text}`), '',
    'Plats dans l’ordre', ...session.cooking.map((c, i) => `${i + 1}. ${c.title} (≈ ${fmtMinutes(c.minutes)})`), '',
    'Conservation', ...session.storage.map((s) => `- ${s.recipe} : ${s.info.pantry ? 'boîte hermétique, une semaine' : `${s.info.fridgeDays} jours au frigo${s.info.freezer ? ', se congèle' : ''}`}`),
  ].join('\n')

  return (
    <div className="max-w-4xl">
      <button className="btn mb-3 flex w-fit items-center gap-1 !px-2 !py-1 !text-sm" onClick={onBack}><ArrowLeft size={14} /> Mes meal preps</button>
      <input defaultValue={prep.name} onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== prep.name) onRename(n) }} aria-label="Nom du meal prep" className="mb-2 w-full bg-transparent text-2xl font-bold outline-none" />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-[var(--fg-muted)]">
        <Clock size={14} /> environ {fmtMinutes(session.minutes)} ·
        <span className="flex items-center rounded-md border border-[var(--border)]">
          <button className="px-2" aria-label="Une portion de moins" onClick={() => onPortions(Math.max(1, prep.portions - 1))}>−</button>
          <span className="tabular-nums">{prep.portions} portions par plat</span>
          <button className="px-2" aria-label="Une portion de plus" onClick={() => onPortions(Math.min(30, prep.portions + 1))}>+</button>
        </span>
        <span className="ml-auto flex gap-2">
          <button className="btn btn-primary !text-sm" onClick={() => onUse(prep.recipeIds, 1)}>Mettre dans la semaine</button>
          <button className="btn !text-sm" onClick={() => void copyText(sheetText()).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000) })}><ClipboardCopy size={14} /> {copied ? 'Copiée !' : 'Copier la fiche'}</button>
          <button className="btn !px-2" aria-label="Supprimer ce meal prep" onClick={onDelete}><Trash2 size={14} /></button>
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div>
          <h4 className="mb-1 font-semibold">Plats</h4>
          <ul className="mb-4">{recipes.map((r) => <li key={r.id} className="px-2 py-0.5 text-sm"><button className="hover:underline" onClick={() => onSelect(r.id)}>{r.title}</button></li>)}</ul>
          {session.first.length > 0 && (<><h4 className="mb-1 font-semibold">À lancer en premier</h4><ul className="mb-4">{session.first.map((t, i) => box(`f${i}`, t.text, t.recipes.join(', ')))}</ul></>)}
          {session.miseEnPlace.length > 0 && (<><h4 className="mb-1 font-semibold">Mise en place commune</h4><ul className="mb-4">{session.miseEnPlace.map((t, i) => box(`m${i}`, t.text, t.recipes.length > 1 ? `commun à ${t.recipes.length} plats` : t.recipes[0]))}</ul></>)}
          <h4 className="mb-1 font-semibold">Les plats, dans cet ordre</h4>
          <ol className="mb-4 space-y-2">
            {session.cooking.map((c, i) => (
              <li key={c.id} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                <div className="flex items-center gap-2"><span className="font-medium">{i + 1}. {c.title}</span><span className="ml-auto flex items-center gap-2 text-xs text-[var(--fg-muted)]">{c.oven !== null && <span className="flex items-center gap-0.5"><Flame size={12} /> four {c.oven} °C</span>}≈ {fmtMinutes(c.minutes)}</span></div>
                {c.steps.length > 0 && <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[var(--fg-muted)]">{c.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>}
                {c.variantSteps.length > 0 && <><div className="mt-1 text-xs font-semibold text-[var(--fg-muted)]">Version sans viande : ce qui change</div><ol className="list-decimal space-y-0.5 pl-5 text-[var(--fg-muted)]">{c.variantSteps.map((s, k) => <li key={k}>{s}</li>)}</ol></>}
              </li>
            ))}
          </ol>
          <h4 className="mb-1 font-semibold">Conservation et réchauffage</h4>
          <ul className="space-y-2">
            {session.storage.map((s) => (
              <li key={s.id} className="rounded-lg border border-[var(--border)] p-2 text-sm">
                <div className="font-medium">{s.recipe}</div>
                <div className="text-xs text-[var(--fg-muted)]">{s.info.pantry ? 'Boîte hermétique, environ une semaine.' : `${s.info.fridgeDays} jours au frigo${s.info.freezer ? ', environ 3 mois au congélateur' : ''}.`} {!s.info.pantry && !s.info.sameDay && `Réchauffage : ${s.info.reheat}`}</div>
                {s.info.tips.length > 0 && <ul className="mt-0.5 list-disc pl-5 text-xs text-[var(--fg-muted)]">{s.info.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
              </li>
            ))}
          </ul>
        </div>
        <aside>
          <h4 className="mb-1 font-semibold">Courses</h4>
          {AISLES.map((a) => {
            const l = shopping.filter((i) => i.aisle === a)
            if (l.length === 0) return null
            return (
              <div key={a} className="mb-2">
                <div className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--fg-muted)]">{a}</div>
                <ul>{l.map((i) => box(`c${i.id}`, i.text))}</ul>
              </div>
            )
          })}
        </aside>
      </div>
    </div>
  )
}
