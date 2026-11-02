import { FolderDown, FolderUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { exportRecipes, importRecipes, recipeRows, scanRecipePhotos, type ExportResult, type ImportResult } from '@/biblio/lib/recipeFolderRun.ts'
import { formatBytes } from '@/biblio/lib/vectors.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import { SettingsSection } from '@/components/SettingsUi'
import { askConfirm } from '@/lib/confirm'
import { useApp } from '@/store/app'

const nf = new Intl.NumberFormat('fr-FR')
const plural = (n: number, one: string, many = `${one}s`) => `${nf.format(n)} ${n > 1 ? many : one}`

/**
 * Les recettes dans le dossier « recette » de la bibliothèque : un dossier par recette (recette.json, recette.md, photos).
 * « Enregistrer » les y range ; « Reprendre » les relit (sur un autre ordinateur, par exemple).
 */
export function RecipeFolder({ disabled }: { disabled: boolean }) {
  const objects = useApp((s) => s.objects)
  const root = useLibrary((s) => s.root)
  const layout = useLibrary((s) => s.layout)
  const rows = useMemo(() => recipeRows(objects), [objects])
  const scan = useMemo(() => scanRecipePhotos(rows), [rows])
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [exported, setExported] = useState<ExportResult | null>(null)
  const [imported, setImported] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const muted = { color: 'var(--fg-muted)' }
  const ready = !!layout?.exists
  const busy = disabled || progress !== null

  const save = async () => {
    const ok = await askConfirm(
      `Ranger tes ${plural(rows.length, 'recette')} dans le dossier « recette » de la bibliothèque : un dossier par recette, avec recette.json, recette.md et ses photos.` +
        (scan.photos > 0 ? ` ${plural(scan.photos, 'photo')} (${formatBytes(scan.bytes)}) quittent la base de données pour le dossier ; une copie de sécurité de ta base est faite juste avant.` : '') +
        ' Si le dossier de la bibliothèque est un jour introuvable (disque débranché), les photos ne s’afficheront plus tant qu’il ne sera pas revenu.',
    )
    if (!ok) return
    setError(null)
    setExported(null)
    setImported(null)
    setProgress({ done: 0, total: rows.length })
    try {
      setExported(await exportRecipes(rows, root, (done, total) => setProgress({ done, total })))
    } catch (e) {
      setError(String(e))
    } finally {
      setProgress(null)
    }
  }

  const load = async () => {
    setError(null)
    setExported(null)
    setImported(null)
    setProgress({ done: 0, total: 0 })
    try {
      setImported(await importRecipes(root))
    } catch (e) {
      setError(String(e))
    } finally {
      setProgress(null)
    }
  }

  return (
    <SettingsSection
      title="Mes recettes dans le dossier « recette »"
      description={
        <>
          Chaque recette a son dossier dans « recette » de la bibliothèque : <b>recette.json</b> (la recette complète, que Form relit pour reprendre tes recettes sur un autre ordinateur), <b>recette.md</b> (la même recette, lisible dans n'importe quel éditeur de texte) et ses photos. Ainsi, copier le dossier de la bibliothèque emporte aussi tes recettes.
          {scan.photos > 0
            ? ` ${plural(scan.photos, 'photo')} de ${plural(scan.recipes, 'recette')} (${formatBytes(scan.bytes)}) sont encore dans la base de données.`
            : rows.length > 0 ? ' Toutes les photos de recettes sont dans le dossier.' : ''}
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={() => void save()} disabled={busy || !ready || rows.length === 0}>
          <FolderDown size={16} /> {progress && progress.total > 0 ? `Rangement… ${nf.format(progress.done)} / ${nf.format(progress.total)}` : 'Enregistrer mes recettes dans le dossier'}
        </button>
        <button className="btn" onClick={() => void load()} disabled={busy || !ready}>
          <FolderUp size={16} /> Reprendre les recettes du dossier
        </button>
      </div>
      {layout && !layout.exists && <p className="mt-2 text-xs" style={{ color: '#d44c47' }}>Le dossier de la bibliothèque est introuvable : choisis-le d'abord.</p>}
      {exported && (
        <p className="mt-3 text-sm" style={muted}>
          {plural(exported.recipes, 'recette')} enregistrée{exported.recipes > 1 ? 's' : ''} dans le dossier ({plural(exported.photos, 'photo')} écrite{exported.photos > 1 ? 's' : ''}
          {exported.lightened > 0 ? `, ${plural(exported.lightened, 'page')} allégée${exported.lightened > 1 ? 's' : ''} dans la base` : ''}).
          {exported.failed > 0 && ` ${plural(exported.failed, 'recette')} n'${exported.failed > 1 ? 'ont' : 'a'} pas pu être enregistrée${exported.failed > 1 ? 's' : ''} : ${exported.errors.slice(0, 3).join(' · ')}.`}
          {exported.backup && ` Copie de sécurité : ${exported.backup}`}
        </p>
      )}
      {imported && (
        <p className="mt-3 text-sm" style={muted}>
          {imported.found === 0
            ? 'Aucune recette trouvée dans le dossier « recette ».'
            : `${plural(imported.found, 'recette')} trouvée${imported.found > 1 ? 's' : ''} : ${plural(imported.created, 'ajoutée')}, ${plural(imported.skipped, 'déjà présente')} (jamais écrasée${imported.skipped > 1 ? 's' : ''}).`}
          {imported.errors.length > 0 && ` Problèmes : ${imported.errors.join(' · ')}`}
        </p>
      )}
      {error && <p className="mt-3 text-sm" style={{ color: '#d44c47' }}>{error}</p>}
    </SettingsSection>
  )
}
