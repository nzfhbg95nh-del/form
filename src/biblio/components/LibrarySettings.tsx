import { SplitSlider } from '@/components/SplitSlider'
import { useEffect, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { Download, FolderOpen, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { AUTO_FREQUENCIES, parseFrequency, type AutoFrequency } from '@/biblio/lib/autoUpdate.ts'
import { getSetting, setSetting } from '@/biblio/lib/library.ts'
import { formatBytes, formatSeconds } from '@/biblio/lib/vectors.ts'
import { useAi } from '@/biblio/store/ai.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import { useTrash } from '@/biblio/store/trash.ts'
import { DuplicatesView } from './DuplicatesView.tsx'
import { MoveLibrary } from './MoveLibrary.tsx'
import { RecipePhotos } from './RecipePhotos.tsx'
import { SaverSection } from './SaverSection.tsx'
import { TrashView } from './TrashView.tsx'

const nf = new Intl.NumberFormat('fr-FR')

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-side)' }}>
      <div className="text-2xl font-semibold">{nf.format(value)}</div>
      <div className="mt-1 text-xs" style={{ color: 'var(--fg-muted)' }}>{label}</div>
    </div>
  )
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--bg-hover)' }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${total > 0 ? pct : 100}%`, background: 'var(--accent)', opacity: total > 0 ? 1 : 0.4 }} />
    </div>
  )
}

/** IA locale : modèle d'images (téléchargé une fois, sur demande) et empreintes de toutes les images. */
function AiSection() {
  const { status, dlDone, dlTotal, embedDone, embedTotal, embedded, pending, provider, failed, lastRun, error, download, embed, classifying, classDone, classTotal, lastClassify, clearAuto, classify, threshold, setThreshold, text, textDone, downloadText } = useAi()
  const [cleared, setCleared] = useState<number | null>(null)
  if (!status) return null
  const downloading = status.downloading
  const embedding = status.embedding
  const partial = !status.model_ready && status.downloaded > 0

  return (
    <section className="mt-10">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--fg-muted)' }}>
        <Sparkles size={13} /> IA locale
      </div>
      <p className="mt-1 text-sm" style={{ color: 'var(--fg-muted)' }}>
        Un modèle d'images (CLIP) tourne sur ton PC, sur la carte graphique si possible : aucune image ne quitte l'ordinateur. Il sert à classer par type et à retrouver des images qui se ressemblent.
      </p>

      {!status.model_ready ? (
        <div className="mt-4">
          <button className="btn btn-primary" onClick={() => void download()} disabled={downloading}>
            <Download size={16} /> {partial ? 'Reprendre le téléchargement' : 'Télécharger le modèle'} ({formatBytes(status.model_size)})
          </button>
          <span className="ml-3 text-xs" style={{ color: 'var(--fg-muted)' }}>Une seule fois, depuis Hugging Face. Le fichier est vérifié à l'arrivée.</span>
          {(downloading || partial) && (
            <div className="mt-3">
              <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                {formatBytes(downloading ? dlDone : status.downloaded)} / {formatBytes(status.model_size)}
              </div>
              <ProgressBar done={downloading ? dlDone : status.downloaded} total={dlTotal || status.model_size} />
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-center gap-3">
            <button className="btn" onClick={() => void embed()} disabled={embedding || pending === 0}>
              <RefreshCw size={16} className={embedding ? 'spin' : ''} /> Calculer les empreintes
            </button>
            <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>
              {new Intl.NumberFormat('fr-FR').format(embedded + (embedding ? embedDone : 0))} faites · {new Intl.NumberFormat('fr-FR').format(Math.max(0, pending - (embedding ? embedDone : 0)))} à faire
              {provider ? ` · ${provider}` : ''}
            </span>
          </div>
          {embedding && (
            <div className="mt-3 max-w-md">
              <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>{embedDone} / {embedTotal}</div>
              <ProgressBar done={embedDone} total={embedTotal} />
            </div>
          )}
          <div className="mt-6 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--fg-muted)' }}>Descriptions en mots (Typo, Recette, astuces)</div>
            {text?.ready ? (
              <p className="mt-2 text-sm" style={{ color: 'var(--fg-muted)' }}>Modèle de texte prêt.</p>
            ) : (
              <div className="mt-2">
                <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>Un deuxième modèle comprend des descriptions écrites (« un plat cuisiné », « une affiche typographique ») : il permet de trouver les images de ces types.</p>
                <div className="mt-3">
                  <button className="btn btn-primary" onClick={() => void downloadText()} disabled={!text || text.downloading}>
                    <Download size={16} /> {text && text.downloaded > 0 ? 'Reprendre le téléchargement' : 'Télécharger le modèle de texte'} ({formatBytes(text?.total ?? 0)})
                  </button>
                </div>
                {text && (text.downloading || text.downloaded > 0) && (
                  <div className="mt-3 max-w-md">
                    <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>{formatBytes(text.downloading ? textDone : text.downloaded)} / {formatBytes(text.total)}</div>
                    <ProgressBar done={text.downloading ? textDone : text.downloaded} total={text.total} />
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="mt-6 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--fg-muted)' }}>Classement automatique par type</div>
            <p className="mt-1 text-sm" style={{ color: 'var(--fg-muted)' }}>
              Les images de tes tableaux gardent le type de leur tableau. Pour les autres, l'IA donne un type seulement si elle est assez sûre (en comparant avec ce que tu as rangé) ; elle repère aussi par description Typo, Recette et les astuces. Le reste, intriable, va dans « Autres ». Tu peux corriger image par image dans la vue détail.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button className="btn" onClick={() => void classify()} disabled={classifying}>
                <RefreshCw size={16} className={classifying ? 'spin' : ''} /> Refaire le classement
              </button>
              <button className="btn" onClick={() => void clearAuto().then((n) => setCleared(n))} disabled={classifying}>Annuler le classement automatique</button>
              <SplitSlider small className="w-64" min={20} max={95} step={5} value={Math.round(threshold * 100)} onChange={(v) => void setThreshold(v / 100)} label="Confiance min." valueLabel={`${Math.round(threshold * 100)} %`} ariaLabel="Confiance minimale" />
            </div>
            {classifying && <div className="mt-3 max-w-md"><div className="text-xs" style={{ color: 'var(--fg-muted)' }}>Comparaison avec tes images rangées… {classDone} / {classTotal}</div><ProgressBar done={classDone} total={classTotal} /></div>}
            <p className="mt-2 text-xs" style={{ color: 'var(--fg-muted)' }}>
              {lastClassify ? `Dernier classement : ${formatSeconds(lastClassify.seconds)}. ${new Intl.NumberFormat('fr-FR').format(lastClassify.byNeighbours)} images hors tableau rangées par comparaison avec les ${new Intl.NumberFormat('fr-FR').format(lastClassify.examples)} que tu as rangées ; ${new Intl.NumberFormat('fr-FR').format(lastClassify.fallback)} dans « Autres » faute d'être sûre.${Object.keys(lastClassify.semantic).length > 0 ? ` Par description : ${Object.entries(lastClassify.semantic).map(([id, n]) => `${id} ${new Intl.NumberFormat('fr-FR').format(n)}`).join(', ')}.` : ''}` : ''}
              {cleared !== null ? ` Classement automatique annulé pour ${new Intl.NumberFormat('fr-FR').format(cleared)} images.` : ''}
            </p>
          </div>
          {!embedding && lastRun && (
            <p className="mt-2 text-xs" style={{ color: 'var(--fg-muted)' }}>
              Dernier calcul : {formatSeconds(lastRun.seconds)}{lastRun.provider ? `, sur ${lastRun.provider.toLowerCase()}` : ''}.
              {failed > 0 ? ` ${failed} image(s) illisible(s) ignorée(s).` : ''}
            </p>
          )}
        </div>
      )}
      {error && <p className="mt-3 text-sm" style={{ color: '#d44c47' }}>{error}</p>}
    </section>
  )
}

/** La corbeille de la bibliothèque : combien d'images, et l'accès à sa page. */
function TrashSection({ onOpen }: { onOpen: () => void }) {
  const count = useTrash((s) => s.count)
  const refresh = useTrash((s) => s.refresh)
  useEffect(() => {
    void refresh()
  }, [refresh])
  return (
    <section className="mt-10">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--fg-muted)' }}>
        <Trash2 size={13} /> Corbeille
      </div>
      <p className="mt-2 text-sm" style={{ color: 'var(--fg-muted)' }}>
        {count === 0 ? 'La corbeille est vide.' : `${nf.format(count)} image${count > 1 ? 's' : ''} à la corbeille : elles ont disparu de la bibliothèque mais leurs fichiers sont intacts.`}
      </p>
      <button className="btn mt-3" onClick={onOpen}>Ouvrir la corbeille</button>
    </section>
  )
}

/** Quand la bibliothèque se met à jour toute seule : jamais, à chaque démarrage (au départ), par jour, par semaine ou par mois. */
function AutoUpdate() {
  const [frequency, setFrequency] = useState<AutoFrequency | null>(null)
  const [lastDay, setLastDay] = useState('')
  useEffect(() => {
    void Promise.all([getSetting('library_auto_frequency'), getSetting('library_auto_update'), getSetting('library_auto_last_day')]).then(([f, legacy, last]) => {
      setFrequency(parseFrequency(f, legacy))
      setLastDay(last ?? '')
    })
  }, [])
  if (frequency === null) return null
  const choose = (next: AutoFrequency) => {
    setFrequency(next)
    void setSetting('library_auto_frequency', next)
    // L'ancien interrupteur reste d'accord avec le choix (une version plus ancienne lirait encore celui-là).
    void setSetting('library_auto_update', next === 'never' ? '0' : '1')
  }
  return (
    <section className="mt-8">
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span>Mettre à jour la bibliothèque automatiquement :</span>
        <select className="lib-input" value={frequency} onChange={(e) => choose(e.target.value as AutoFrequency)} aria-label="Fréquence de la mise à jour automatique">
          {AUTO_FREQUENCIES.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-xs" style={{ color: 'var(--fg-muted)' }}>
        Quelques secondes après l'ouverture de Form, quand c'est le moment, Form cherche les nouveaux fichiers de ta bibliothèque, fait leurs miniatures, calcule leurs empreintes d'IA et leurs couleurs, lit le texte des vidéos et les classe. Rien ne se lance s'il n'y a rien de nouveau. Le bouton « Mettre à jour la bibliothèque » fonctionne toujours, quel que soit ce choix.
        {frequency !== 'never' && frequency !== 'startup' && (lastDay ? ` Dernière mise à jour automatique : ${lastDay.split('-').reverse().join('/')}.` : ' Aucune mise à jour automatique faite pour le moment.')}
      </p>
    </section>
  )
}

export function LibrarySettings() {
  const { root, layout, phase, label, done, total, stats, lastResult, error, setRoot, update } = useLibrary()
  const [trashOpen, setTrashOpen] = useState(false)
  const [dupesOpen, setDupesOpen] = useState(false)
  const busy = phase !== 'idle'
  useEffect(() => {
    void useLibrary.getState().init()
    void useAi.getState().init(false)
  }, [])
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0

  const choose = async () => {
    const picked = await open({ directory: true, defaultPath: root || undefined, title: 'Dossier « Bibliothèque Form »' })
    if (typeof picked === 'string') await setRoot(picked)
  }

  if (trashOpen) return <TrashView onBack={() => setTrashOpen(false)} />
  if (dupesOpen) return <DuplicatesView onBack={() => setDupesOpen(false)} />

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl font-bold">Bibliothèque</h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--fg-muted)' }}>
        Toute la bibliothèque tient dans un seul dossier. Form ne retient que son chemin : tu peux le déplacer où tu veux (un autre disque, par exemple), puis le lui redonner ici. Form lit tes enregistrements sans les modifier : rien n'est renommé. Seule exception, quand tu choisis « Supprimer définitivement » : le fichier part dans la Corbeille Windows.
      </p>

      <section className="mt-6">
        <div className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--fg-muted)' }}>Dossier « Bibliothèque Form »</div>
        <div className="mt-2 flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} title={root}>{root}</div>
          <button className="btn" onClick={choose} disabled={busy}><FolderOpen size={16} /> Choisir…</button>
        </div>
        <ul className="mt-2 space-y-0.5 text-xs" style={{ color: 'var(--fg-muted)' }}>
          <li>Dedans : <b>instagram</b>, <b>pinterest</b>, <b>images ajoutées</b>, <b>recette</b> et <b>cache</b> (miniatures et modèle d'IA, qui se refont tout seuls).</li>
          {layout && !layout.exists && <li style={{ color: '#d44c47' }}>Ce dossier est introuvable (disque débranché ou dossier déplacé ?). Choisis son nouvel emplacement.</li>}
          {layout?.exists && (
            <li>{layout.cache_in_library ? 'Le cache est dans la bibliothèque.' : 'Le cache (miniatures, modèle d\'IA) est encore sur le disque C: : « Déplacer ma bibliothèque… » le range dans la bibliothèque.'}</li>
          )}
        </ul>
      </section>

      <MoveLibrary disabled={busy} />

      <section className="mt-6 flex items-center gap-3">
        <button className="btn btn-primary" onClick={() => void update()} disabled={busy}>
          <RefreshCw size={16} className={phase === 'sync' ? 'spin' : ''} /> Mettre à jour la bibliothèque
        </button>
        {busy && (
          <div className="min-w-0 flex-1">
            <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>
              {label}{total > 0 ? ` ${nf.format(done)} / ${nf.format(total)}` : ''}
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--bg-hover)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${total > 0 ? pct : 100}%`, background: 'var(--accent)', opacity: total > 0 ? 1 : 0.4 }} />
            </div>
          </div>
        )}
      </section>

      {error && <p className="mt-4 text-sm" style={{ color: '#d44c47' }}>{error}</p>}
      {lastResult && !busy && (
        <p className="mt-4 text-sm" style={{ color: 'var(--fg-muted)' }}>
          Dernière mise à jour : {nf.format(lastResult.scanned)} fichiers lus, {nf.format(lastResult.added)} nouveaux, {nf.format(lastResult.missing)} disparus.
        </p>
      )}

      {stats && (
        <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Blocs (images, vidéos, carrousels)" value={stats.blocks} />
          <Stat label="Fichiers" value={stats.files} />
          <Stat label="Collections automatiques" value={stats.collections} />
          <Stat label="Fichiers introuvables" value={stats.missing} />
          <Stat label="Miniatures prêtes" value={stats.thumbsReady} />
          <Stat label="Miniatures à faire" value={stats.thumbsPending} />
          <Stat label="Miniatures impossibles" value={stats.thumbsFailed} />
        </section>
      )}

      <AutoUpdate />
      <RecipePhotos disabled={busy} />
      <AiSection />
      <section className="mt-10">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--fg-muted)' }}>Doublons</div>
        <p className="mt-2 text-sm" style={{ color: 'var(--fg-muted)' }}>
          Trouve les images en double (identiques ou presque) et te laisse choisir lesquelles garder. Les autres partent dans la Corbeille Windows, jamais effacées pour de bon.
        </p>
        <button className="btn mt-3" onClick={() => setDupesOpen(true)}>Chercher les doublons</button>
      </section>
      <TrashSection onOpen={() => setTrashOpen(true)} />
      <section className="mt-10 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
        <SaverSection />
      </section>
    </div>
  )
}
