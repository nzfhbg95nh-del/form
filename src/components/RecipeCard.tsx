import { Icon } from '@/components/Icon'
import { coverStyle } from '@/components/PagePickers'
import { displayUrl } from '@/biblio/lib/libraryUrl.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import { firstImageUrl } from '@/lib/content'
import { parseValues } from '@/lib/database'
import { RECIPE } from '@/lib/recipes'
import { displayTitle } from '@/lib/lastEdit'
import type { ObjectRow } from '@/lib/types'
import { useApp } from '@/store/app'

// La carte d'une recette vit dans son propre fichier : l'accueil l'affiche sans charger toute la page des recettes (et son éditeur).
/** Carte d'une recette : sa photo (couverture, sinon première image de la page, sinon l'icône) et son titre. */
export function RecipeCard({ row, tall = false }: { row: ObjectRow; tall?: boolean }) {
  const select = useApp((s) => s.select)
  const v = parseValues(row.properties)
  const stars = /^r([1-5])$/.exec(String(v[RECIPE.rating] ?? ''))
  const diff = { d1: 'Facile', d2: 'Moyen', d3: 'Difficile' }[String(v[RECIPE.difficulty] ?? '') as 'd1']
  // Pas de temps sur la fiche : il changerait la hauteur des cartes (le temps reste dans la propriété « Préparation » de la recette).
  const info = [stars ? '★'.repeat(Number(stars[1])) : '', diff ?? ''].filter(Boolean).join(' · ')
  // Les photos rangées dans la bibliothèque n'ont d'adresse qu'une fois le dossier connu : la carte se met à jour à ce moment-là.
  useLibrary((s) => s.root + s.ready)
  const photo = row.cover ? null : displayUrl(firstImageUrl(row.content, `${row.id}:${row.updated_at}`))
  const style = row.cover
    ? coverStyle(row.cover)
    : photo
      ? { backgroundImage: `url("${photo}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : undefined
  return (
    <button data-page-id={row.id} onClick={() => select(row.id)} className="group overflow-hidden rounded-xl border border-[var(--border)] text-left shadow-[var(--shadow-soft)] transition-colors hover:bg-[var(--bg-hover)]">
      {/* La photo et le texte sont dans le même cadre arrondi. */}
      <div
        className={'relative flex items-center justify-center bg-[var(--bg-side)] after:pointer-events-none after:absolute after:inset-0 after:bg-black/0 after:transition-colors after:duration-200 after:content-[\'\'] group-hover:after:bg-black/10 ' + (tall ? 'h-44' : 'h-32')}
        style={style}
      >
        {!row.cover && !photo && row.icon && row.icon !== '🍳' && <Icon value={row.icon} size={40} />}
      </div>
      {/* Hauteur fixe : toutes les fiches ont la même dimension, qu'elles aient une note ou une difficulté ou non. */}
      <div className="flex h-10 flex-col justify-center px-3">
        <div className="truncate text-sm font-medium">{displayTitle(row.title)}</div>
        {info && <div className="truncate text-xs leading-4 text-[var(--fg-muted)]">{info}</div>}
      </div>
    </button>
  )
}
