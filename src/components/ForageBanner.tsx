import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Leaf } from 'lucide-react'
import { forageAlerts, forageCalendar } from '@/lib/forage'
import { displayTitle } from '@/lib/lastEdit'
import type { ObjectRow } from '@/lib/types'
import { useApp } from '@/store/app'

const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`

/**
 * Cueillette : prévient quand c'est le moment (ou bientôt le moment) de cueillir les plantes sauvages que les recettes utilisent
 * (fleurs de sureau, tilleul, lilas…), avec un conseil ; et le calendrier de l'année, replié.
 */
export function ForageBanner({ rows }: { rows: ObjectRow[] }) {
  const select = useApp((s) => s.select)
  const [open, setOpen] = useState(false)
  const recipes = useMemo(() => rows.map((r) => ({ id: r.id, title: displayTitle(r.title), text: r.content ?? '' })), [rows])
  const alerts = useMemo(() => forageAlerts(recipes, new Date()), [recipes])
  const calendar = useMemo(() => forageCalendar(recipes), [recipes])
  if (calendar.length === 0) return null

  const recipeLinks = (list: { id: string; title: string }[]) => list.map((r, i) => (
    <span key={r.id}>{i > 0 && ', '}<button className="hover:underline" onClick={() => select(r.id)}>{r.title}</button></span>
  ))

  return (
    <section className="mb-6" aria-label="Cueillette">
      {alerts.length === 0 && <p className="mb-2 text-sm text-[var(--fg-muted)]">Rien à cueillir pour tes recettes en ce moment, ni dans le mois qui vient.</p>}
      {alerts.map((a) => (
        <div key={a.plant.id} className="mb-2 rounded-xl border p-3" style={{ borderColor: a.status === 'now' ? '#44836180' : 'var(--border)', background: a.status === 'now' ? 'rgba(68,131,97,0.08)' : undefined }}>
          <div className="flex flex-wrap items-baseline gap-2">
            <Leaf size={15} className="self-center" style={{ color: '#448361' }} />
            <span className="font-medium">
              {a.status === 'now' ? `C’est le moment de cueillir : ${a.plant.name.toLowerCase()}` : `Bientôt : ${a.plant.name.toLowerCase()}`}
            </span>
            <span className="text-xs text-[var(--fg-muted)]">
              {a.status === 'now' ? (a.days === 0 ? 'dernier jour' : `encore ${plural(a.days, 'jour')}`) : `dans ${plural(a.days, 'jour')}`} · {a.window}
            </span>
          </div>
          <div className="mt-1 text-sm text-[var(--fg-muted)]">Pour : {recipeLinks(a.recipes)}</div>
          <div className="mt-1 text-xs text-[var(--fg-muted)]">{a.plant.tip}</div>
        </div>
      ))}
      <button className="flex items-center gap-1 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} <Leaf size={13} /> Calendrier de cueillette de tes recettes ({calendar.length})
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-[var(--border)] p-3">
          <ul className="space-y-1.5 text-sm">
            {calendar.map((c) => (
              <li key={c.plant.id}>
                <span className="font-medium">{c.plant.name}</span> <span className="text-xs text-[var(--fg-muted)]">{c.window}</span>
                <div className="text-xs text-[var(--fg-muted)]">Pour : {recipeLinks(c.recipes)}</div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-[var(--fg-muted)]">Périodes indicatives (Belgique, nord de la France) : elles varient selon l’année. Cueille loin des routes et des champs traités, une petite partie de chaque plante, et seulement ce que tu reconnais avec certitude.</p>
        </div>
      )}
    </section>
  )
}
