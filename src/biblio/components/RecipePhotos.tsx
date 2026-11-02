import { ImageDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { moveRecipePhotos, recipeRows, scanRecipePhotos, type MoveRecipePhotosResult } from '@/biblio/lib/recipePhotos.ts'
import { formatBytes } from '@/biblio/lib/vectors.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import { askConfirm } from '@/lib/confirm'
import { useApp } from '@/store/app'

const nf = new Intl.NumberFormat('fr-FR')

/** Range les photos des recettes (cachées dans la base) dans le dossier « recettes » de la bibliothèque. */
export function RecipePhotos({ disabled }: { disabled: boolean }) {
  const objects = useApp((s) => s.objects)
  const root = useLibrary((s) => s.root)
  const layout = useLibrary((s) => s.layout)
  const scan = useMemo(() => scanRecipePhotos(recipeRows(objects)), [objects])
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<MoveRecipePhotosResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const muted = { color: 'var(--fg-muted)' }

  const run = async () => {
    const ok = await askConfirm(
      `Ranger ${nf.format(scan.photos)} photo${scan.photos > 1 ? 's' : ''} de recettes (${formatBytes(scan.bytes)}) dans le dossier « recettes » de la bibliothèque ? Une copie de sécurité de ta base est faite juste avant. Si le dossier de la bibliothèque est un jour introuvable (disque débranché), les photos ne s'afficheront plus tant qu'il ne sera pas revenu.`,
    )
    if (!ok) return
    setError(null)
    setResult(null)
    setProgress({ done: 0, total: 0 })
    try {
      setResult(await moveRecipePhotos(recipeRows(useApp.getState().objects), root, (done, total) => setProgress({ done, total })))
    } catch (e) {
      setError(String(e))
    } finally {
      setProgress(null)
    }
  }

  return (
    <section className="mt-10">
      <div className="text-xs font-medium uppercase tracking-wide" style={muted}>Photos des recettes</div>
      <p className="mt-2 text-sm" style={muted}>
        {scan.photos === 0
          ? 'Toutes les photos de recettes sont dans le dossier « recettes » de la bibliothèque (ou il n\'y en a pas).'
          : `${nf.format(scan.photos)} photo${scan.photos > 1 ? 's' : ''} de ${nf.format(scan.recipes)} recette${scan.recipes > 1 ? 's' : ''} (${formatBytes(scan.bytes)}) sont encore dans la base de données. Les ranger dans le dossier « recettes » allège la base et rend la bibliothèque complète, facile à copier sur un autre ordinateur.`}
      </p>
      {scan.photos > 0 && (
        <button className="btn mt-3" onClick={() => void run()} disabled={disabled || progress !== null || !layout?.exists}>
          <ImageDown size={16} /> {progress ? `Rangement… ${nf.format(progress.done)} / ${nf.format(progress.total)}` : 'Ranger les photos dans le dossier recettes'}
        </button>
      )}
      {layout && !layout.exists && <p className="mt-2 text-xs" style={{ color: '#d44c47' }}>Le dossier de la bibliothèque est introuvable : choisis-le d'abord.</p>}
      {result && (
        <p className="mt-3 text-sm" style={muted}>
          {nf.format(result.moved)} photo{result.moved > 1 ? 's' : ''} rangée{result.moved > 1 ? 's' : ''} ({formatBytes(result.bytes)}) pour {nf.format(result.recipes)} recette{result.recipes > 1 ? 's' : ''}.
          {result.failed > 0 && ` ${nf.format(result.failed)} n'ont pas pu être rangées : elles sont restées dans la base.`}
          {` Copie de sécurité : ${result.backup}`}
        </p>
      )}
      {error && <p className="mt-3 text-sm" style={{ color: '#d44c47' }}>{error}</p>}
    </section>
  )
}
