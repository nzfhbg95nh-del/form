import { useState } from 'react'
import { appConfigDir, join } from '@tauri-apps/api/path'
import Database from '@tauri-apps/plugin-sql'
import { importLibrary, isComplete, type Progress, type TableReport } from '@/lib/biblioImport'

const primary = 'rounded bg-[var(--accent)] px-4 py-1.5 text-sm text-white disabled:opacity-40'
const nf = new Intl.NumberFormat('fr-FR')

/** Réglages > Bibliothèque : copie la bibliothèque de Klippr (lue seulement) dans Form. Peut être relancée sans risque. */
export function LibraryImport() {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [report, setReport] = useState<TableReport[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    setReport(null)
    try {
      // La base de Klippr est dans le dossier voisin de celui de Form.
      const path = await join(await appConfigDir(), '..', 'fr.victor.klippr', 'klippr.db')
      const source = await Database.load('sqlite:' + path)
      try {
        await source.select('SELECT COUNT(*) AS n FROM lib_blocks')
      } catch {
        throw new Error("Je ne trouve pas la bibliothèque de Klippr sur ce PC (fichier klippr.db). Ouvre Klippr au moins une fois, puis ferme-le, et réessaie.")
      }
      const target = await Database.load('sqlite:form.db')
      setReport(await importLibrary(source, target, setProgress))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-12 py-8">
      <h2 className="text-2xl font-bold">Bibliothèque</h2>
      <p className="mt-2 text-sm text-[var(--fg-muted)]">
        La bibliothèque d'images et de vidéos de Klippr (tes enregistrements Instagram et Pinterest) rejoint Form. Cette étape copie ses données :
        blocs, collections, types, empreintes de l'IA, couleurs, Carte, texte lu dans les vidéos. Klippr n'est pas modifié et doit être fermé pendant la copie.
        Tu peux la relancer sans risque : ce qui est déjà dans Form est ignoré.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button className={primary} onClick={() => void run()} disabled={busy}>{busy ? 'Copie en cours…' : 'Importer ma bibliothèque Klippr'}</button>
        {busy && progress && (
          <span className="text-sm text-[var(--fg-muted)]">{progress.table} : {nf.format(progress.done)} / {nf.format(progress.total)}</span>
        )}
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-500">{error}</p>}
      {report && (
        <div className="mt-6">
          <p className={'text-sm font-medium ' + (isComplete(report) ? 'text-green-600' : 'text-red-500')}>
            {isComplete(report) ? 'Copie terminée : tout est dans Form.' : 'Copie incomplète : relance l\'import.'}
          </p>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-[var(--fg-muted)]"><th className="py-1 font-normal">Table</th><th className="py-1 text-right font-normal">Klippr</th><th className="py-1 text-right font-normal">Form</th></tr></thead>
            <tbody>
              {report.map((r) => (
                <tr key={r.table} className="border-t border-[var(--border)]">
                  <td className="py-1">{r.table}</td>
                  <td className="py-1 text-right">{nf.format(r.source)}</td>
                  <td className="py-1 text-right">{nf.format(r.target)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
