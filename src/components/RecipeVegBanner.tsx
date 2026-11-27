import { useMemo } from 'react'
import { ArrowDown, Leaf } from 'lucide-react'
import { parseContent } from '@/lib/content'
import { MEAT } from '@/lib/mealPrep'
import { fold, readIngredients } from '@/lib/shoppingList'
import { dishTitle, variantInfo } from '@/lib/vegTitle'
import { vegSwaps } from '@/lib/vegSwaps'
import type { ObjectRow } from '@/lib/types'

/** Fait défiler la page jusqu'au titre « Version sans viande… » de l'éditeur. */
function scrollToHeading(heading: string) {
  const want = fold(heading)
  const el = [...document.querySelectorAll<HTMLElement>('.bn-editor [data-content-type="heading"]')].find((h) => fold(h.textContent ?? '').trim() === want)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * En haut d'une recette qui contient de la viande ou du poisson : la version végé, tout de suite (végé par défaut).
 * - Si la recette a sa section « Version sans viande », on montre son nom, ce qui est remplacé et les ingrédients à utiliser, avec un lien vers la section.
 * - Sinon, on propose par quoi remplacer chaque viande (pistes simples).
 */
export function RecipeVegBanner({ page }: { page: ObjectRow }) {
  const data = useMemo(() => {
    const blocks = parseContent(page.content) ?? []
    const { main, variant } = readIngredients(blocks)
    const lines = main.flatMap((g) => g.lines)
    if (!MEAT.test(fold(lines.join(' ')))) return null
    const info = variantInfo(blocks)
    if (info) return { kind: 'written' as const, info, variant: variant ?? [], name: dishTitle(page) }
    return { kind: 'swaps' as const, swaps: vegSwaps(lines) }
  }, [page])
  if (!data) return null
  if (data.kind === 'swaps' && data.swaps.length === 0) return null

  return (
    <section className="mb-4 rounded-xl px-4 py-3" style={{ background: 'color-mix(in srgb, #448361 10%, var(--bg))', border: '1px solid color-mix(in srgb, #448361 28%, transparent)' }} aria-label="Version végé">
      <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#448361' }}>
        <Leaf size={15} />
        {data.kind === 'written' ? <>Version végé : {data.name}</> : <>Pas encore de version végé : par quoi remplacer</>}
      </div>
      {data.kind === 'written' ? (
        <>
          {data.info.intro && <p className="mt-1.5 text-sm">{data.info.intro}</p>}
          {data.variant.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
              {data.variant.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}
          <button className="btn mt-3" onClick={() => scrollToHeading(data.info.heading)}><ArrowDown size={14} /> Voir toute la version végé</button>
          <p className="mt-2 text-xs text-[var(--fg-muted)]">Les courses, la nutrition et le planning utilisent déjà cette version.</p>
        </>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {data.swaps.map((s) => (
            <li key={s.meat}><b className="font-medium">{s.meat[0].toUpperCase() + s.meat.slice(1)}</b> → {s.sub}. <span className="text-[var(--fg-muted)]">{s.tip}</span></li>
          ))}
        </ul>
      )}
    </section>
  )
}
