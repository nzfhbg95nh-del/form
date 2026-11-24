import { CalendarDays, Sprout } from 'lucide-react'
import { ForageBanner } from '@/components/ForageBanner'
import { inSeasonNames, monthName } from '@/lib/seasons'
import type { ObjectRow } from '@/lib/types'

/**
 * L'accueil de la cuisine : la date du jour (elle décide de ce qui est de saison et à cueillir),
 * les fruits et légumes du mois, puis la cueillette. Les idées pour aujourd'hui et de meal prep viennent au lot suivant.
 */
export function KitchenHome({ rows }: { rows: ObjectRow[] }) {
  const today = new Date()
  const month = today.getMonth() + 1
  const date = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const season = inSeasonNames(month)
  return (
    <div className="max-w-4xl">
      <h1 className="py-1 text-3xl font-bold leading-[1.3]">Cuisine</h1>
      <p className="mb-6 flex items-center gap-1.5 text-sm text-[var(--fg-muted)]"><CalendarDays size={14} /> Aujourd’hui : {date}</p>

      <section className="mb-6" aria-label="De saison">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold"><Sprout size={16} style={{ color: '#448361' }} /> De saison en {monthName(month)}</h2>
        {season.length === 0 ? (
          <p className="text-sm text-[var(--fg-muted)]">Rien de noté pour ce mois.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {season.map((n) => <span key={n} className="rounded-full px-2.5 py-0.5 text-sm" style={{ background: 'rgba(68,131,97,0.12)', color: 'var(--fg)' }}>{n}</span>)}
          </div>
        )}
      </section>

      <h2 className="mb-2 text-base font-semibold">Cueillette</h2>
      <ForageBanner rows={rows} />
    </div>
  )
}
