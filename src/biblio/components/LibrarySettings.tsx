import { SplitSlider } from '@/components/SplitSlider'
import { useEffect, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { desktopDir, documentDir } from '@tauri-apps/api/path'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { Download, FolderOpen, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { SettingsHeader, SettingsSection, SubNav, type SubNavItem } from '@/components/SettingsUi'
import { AUTO_FREQUENCIES, parseFrequency, type AutoFrequency } from '@/biblio/lib/autoUpdate.ts'
import { getSetting, setSetting } from '@/biblio/lib/library.ts'
import { formatBytes, formatSeconds } from '@/biblio/lib/vectors.ts'
import { useAi } from '@/biblio/store/ai.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import { useTrash } from '@/biblio/store/trash.ts'
import { DuplicatesView } from './DuplicatesView.tsx'
import { MoveLibrary } from './MoveLibrary.tsx'
import { RecipeFolder } from './RecipeFolder.tsx'
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

/**
 * IA locale : seulement le classement par type. Les empreintes, les couleurs et le texte des vidéos se calculent tout seuls après
 * chaque mise à jour ; les boutons de téléchargement des modèles n'apparaissent que si un modèle manque encore.
 */
function AiSection() {
  const { status, dlDone, dlTotal, error, download, classifying, classDone, classTotal, lastClassify, clearAuto, classify, threshold, setThreshold, text, textDone, downloadText } = useAi()
  const [cleared, setCleared] = useState<number | null>(null)
  if (!status) return null
  const muted = { color: 'var(--fg-muted)' }
  const downloading = status.downloading
  const partial = !status.model_ready && status.downloaded > 0
  const fr = new Intl.NumberFormat('fr-FR')

  return (
    <SettingsSection title="Classement automatique par type" icon={<Sparkles size={16} />} description="Un modèle d'images tourne sur ton PC : aucune image ne quitte l'ordinateur. Les empreintes, les couleurs et le texte des vidéos se calculent tout seuls après chaque mise à jour.">
      {!status.model_ready && (
        <div className="mb-5">
          <button className="btn btn-primary" onClick={() => void download()} disabled={downloading}>
            <Download size={16} /> {partial ? 'Reprendre le téléchargement' : 'Télécharger le modèle'} ({formatBytes(status.model_size)})
          </button>
          <span className="ml-3 text-xs" style={muted}>Une seule fois, depuis Hugging Face. Le classement en a besoin.</span>
          {(downloading || partial) && (
            <div className="mt-3">
              <div className="text-xs" style={muted}>{formatBytes(downloading ? dlDone : status.downloaded)} / {formatBytes(status.model_size)}</div>
              <ProgressBar done={downloading ? dlDone : status.downloaded} total={dlTotal || status.model_size} />
            </div>
          )}
        </div>
      )}
      {status.model_ready && !text?.ready && (
        <div className="mb-5">
          <button className="btn btn-primary" onClick={() => void downloadText()} disabled={!text || text.downloading}>
            <Download size={16} /> {text && text.downloaded > 0 ? 'Reprendre le téléchargement' : 'Télécharger le modèle de texte'} ({formatBytes(text?.total ?? 0)})
          </button>
          <span className="ml-3 text-xs" style={muted}>Une seule fois : il permet de repérer Typo et Recette par description.</span>
          {text && (text.downloading || text.downloaded > 0) && (
            <div className="mt-3 max-w-md">
              <div className="text-xs" style={muted}>{formatBytes(text.downloading ? textDone : text.downloaded)} / {formatBytes(text.total)}</div>
              <ProgressBar done={text.downloading ? textDone : text.downloaded} total={text.total} />
            </div>
          )}
        </div>
      )}
      <p className="text-sm" style={muted}>
        Les images de tes tableaux gardent le type de leur tableau. Pour les autres, l'IA donne un type seulement si elle est assez sûre (en comparant avec ce que tu as rangé) ; elle repère aussi par description Typo, Recette et les astuces. Le reste, intriable, va dans « Autres ». Tu peux corriger image par image dans la vue détail.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn" onClick={() => void classify()} disabled={classifying}>
          <RefreshCw size={16} className={classifying ? 'spin' : ''} /> Refaire le classement
        </button>
        <button className="btn" onClick={() => void clearAuto().then((n) => setCleared(n))} disabled={classifying}>Annuler le classement automatique</button>
        <SplitSlider small className="w-64" min={20} max={95} step={5} value={Math.round(threshold * 100)} onChange={(v) => void setThreshold(v / 100)} label="Confiance min." valueLabel={`${Math.round(threshold * 100)} %`} ariaLabel="Confiance minimale" />
      </div>
      {classifying && <div className="mt-3 max-w-md"><div className="text-xs" style={muted}>Comparaison avec tes images rangées… {classDone} / {classTotal}</div><ProgressBar done={classDone} total={classTotal} /></div>}
      <p className="mt-2 text-xs" style={muted}>
        {lastClassify ? `Dernier classement : ${formatSeconds(lastClassify.seconds)}. ${fr.format(lastClassify.byNeighbours)} images hors tableau rangées par comparaison avec les ${fr.format(lastClassify.examples)} que tu as rangées ; ${fr.format(lastClassify.fallback)} dans « Autres » faute d'être sûre.${Object.keys(lastClassify.semantic).length > 0 ? ` Par description : ${Object.entries(lastClassify.semantic).map(([id, n]) => `${id} ${fr.format(n)}`).join(', ')}.` : ''}` : ''}
        {cleared !== null ? ` Classement automatique annulé pour ${fr.format(cleared)} images.` : ''}
      </p>
      {error && <p className="mt-3 text-sm" style={{ color: '#d44c47' }}>{error}</p>}
    </SettingsSection>
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
    <SettingsSection title="Corbeille" icon={<Trash2 size={16} />} description={count === 0 ? 'La corbeille est vide.' : `${nf.format(count)} image${count > 1 ? 's' : ''} à la corbeille : elles ont disparu de la bibliothèque mais leurs fichiers sont intacts.`}>
      <button className="btn" onClick={onOpen}>Ouvrir la corbeille</button>
    </SettingsSection>
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
    <div>
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
    </div>
  )
}

type Part = 'folder' | 'download' | 'recipes' | 'ai' | 'clean'

/** Les dossiers de la bibliothèque et à quoi ils servent. */
const FOLDERS = [
  ['instagram', 'tes enregistrements Instagram'],
  ['pinterest', 'tes épingles Pinterest'],
  ['images ajoutées', 'les images que tu ajoutes à la main'],
  ['recette', 'tes recettes (un dossier par recette, avec ses photos)'],
  ['cache', 'miniatures et modèle d\'IA : ils se refont tout seuls si on les perd'],
] as const

export function LibrarySettings() {
  const { root, layout, phase, label, done, total, stats, lastResult, error, setRoot, update, videoThumbs } = useLibrary()
  const trashCount = useTrash((s) => s.count)
  const [part, setPart] = useState<Part>('folder')
  const [trashOpen, setTrashOpen] = useState(false)
  const [dupesOpen, setDupesOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [candidate, setCandidate] = useState<string | null>(null)
  const busy = phase !== 'idle'
  const missingFolder = !!layout && !layout.exists
  const noFolder = root.trim() === ''
  useEffect(() => {
    void useLibrary.getState().init()
    void useAi.getState().init(false)
  }, [])

  // Dossier introuvable (autre ordinateur, autre profil Windows) : on cherche un dossier « Bibliotheque » sur le Bureau ou dans Documents de CET ordinateur.
  useEffect(() => {
    if (!missingFolder && !noFolder) return
    let cancelled = false
    void (async () => {
      for (const base of [await desktopDir().catch(() => ''), await documentDir().catch(() => '')]) {
        if (!base) continue
        const path = `${base.replace(/[\\/]+$/, '')}\\Bibliotheque`
        if (path !== root && (await invoke<boolean>('library_dir_exists', { path }).catch(() => false))) {
          if (!cancelled) setCandidate(path)
          return
        }
      }
      if (!cancelled) setCandidate(null)
    })()
    return () => { cancelled = true }
  }, [missingFolder, noFolder, root])

  const choose = async () => {
    const picked = await open({ directory: true, defaultPath: root || undefined, title: 'Dossier « Bibliotheque »' })
    if (typeof picked === 'string') await setRoot(picked)
  }

  const reveal = async () => {
    setNote(null)
    try {
      await revealItemInDir(root)
    } catch {
      setNote('Impossible d\'ouvrir le dossier : il est introuvable ou Windows a refusé.')
    }
  }

  if (trashOpen) return <TrashView onBack={() => setTrashOpen(false)} />
  if (dupesOpen) return <DuplicatesView onBack={() => setDupesOpen(false)} />

  const muted = { color: 'var(--fg-muted)' }
  const parts: SubNavItem<Part>[] = [
    { id: 'folder', label: 'Ma bibliothèque', badge: missingFolder || noFolder ? '!' : undefined },
    { id: 'download', label: 'Téléchargement' },
    { id: 'recipes', label: 'Recettes' },
    { id: 'ai', label: 'IA locale' },
    { id: 'clean', label: 'Nettoyage', badge: trashCount > 0 ? nf.format(trashCount) : undefined },
  ]

  return (
    <div className="mx-auto max-w-3xl px-12 py-10">
      <SettingsHeader title="Bibliothèque" subtitle="Tes images, tes vidéos et tes recettes, rangées dans un seul dossier que tu peux déplacer où tu veux." />

      {(missingFolder || noFolder) && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm" style={{ borderColor: '#d44c47', background: 'color-mix(in srgb, #d44c47 8%, transparent)' }}>
          <span className="min-w-0 flex-1">
            {noFolder ? 'Aucun dossier choisi : Form ne sait pas où est ta bibliothèque.' : 'Le dossier de la bibliothèque est introuvable (disque débranché ou dossier déplacé ?).'}
          </span>
          {candidate && <button className="btn btn-primary" onClick={() => void setRoot(candidate)} title={candidate}><FolderOpen size={16} /> Utiliser « {candidate} »</button>}
          <button className={'btn' + (candidate ? '' : ' btn-primary')} onClick={() => void choose()}><FolderOpen size={16} /> Choisir le dossier</button>
        </div>
      )}

      <SubNav items={parts} value={part} onChange={setPart} />

      <div className="[&>section]:!mt-0">
        {part === 'folder' && (
          <>
            <SettingsSection title="Mon dossier Bibliotheque" description="Tout est dedans. Form ne retient que son chemin : après l'avoir déplacé, redonne-le ici et rien ne casse.">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} title={root}>{root || 'Aucun dossier choisi'}</div>
                <button className="btn" onClick={() => void choose()} disabled={busy}><FolderOpen size={16} /> Choisir…</button>
                <button className="btn" onClick={() => void reveal()} disabled={noFolder || missingFolder}>Ouvrir</button>
              </div>
              {note && <p className="mt-2 text-xs" style={{ color: '#d44c47' }}>{note}</p>}
              <ul className="mt-4 space-y-1 text-sm">
                {FOLDERS.map(([name, use]) => (
                  <li key={name} className="flex gap-2">
                    <b className="w-36 shrink-0">{name}</b>
                    <span style={muted}>{use}</span>
                  </li>
                ))}
              </ul>
              {layout?.exists && (
                <p className="mt-3 text-xs" style={muted}>
                  {layout.cache_in_library ? 'Le cache est dans la bibliothèque.' : 'Le cache (miniatures, modèle d\'IA) est encore sur le disque C: : « Déplacer ma bibliothèque… » le range dans la bibliothèque.'}
                </p>
              )}
              <p className="mt-2 text-xs" style={muted}>Form lit tes enregistrements sans les modifier. Seule exception, « Supprimer définitivement » : le fichier part dans la Corbeille Windows.</p>
            </SettingsSection>
            <SettingsSection title="Mettre à jour" description="Form cherche les nouveaux fichiers de ta bibliothèque, fait leurs miniatures, calcule leurs empreintes d'IA et leurs couleurs, lit le texte des vidéos et les classe. Rien ne se lance s'il n'y a rien de nouveau.">
              <div className="flex items-center gap-3">
                <button className="btn btn-primary" onClick={() => void update()} disabled={busy || noFolder}>
                  <RefreshCw size={16} className={phase === 'sync' ? 'spin' : ''} /> Mettre à jour la bibliothèque
                </button>
                {busy && (
                  <div className="min-w-0 flex-1">
                    <div className="text-xs" style={muted}>{label}{total > 0 ? ` ${nf.format(done)} / ${nf.format(total)}` : ''}</div>
                    <ProgressBar done={done} total={total} />
                  </div>
                )}
              </div>
              {error && <p className="mt-3 text-sm" style={{ color: '#d44c47' }}>{error}</p>}
              {lastResult && !busy && (
                <p className="mt-3 text-sm" style={muted}>
                  Dernière mise à jour : {nf.format(lastResult.scanned)} fichiers lus, {nf.format(lastResult.added)} nouveaux, {nf.format(lastResult.missing)} disparus.
                </p>
              )}
              <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                <AutoUpdate />
              </div>
            </SettingsSection>
            <SettingsSection
              title="Miniatures des vidéos"
              description="Form lit la première image de chaque vidéo pour en faire une miniature (aucun programme en plus). Ça se fait tout seul après une mise à jour ; ce bouton relance les vidéos qui n'en ont pas encore."
            >
              <div className="flex flex-wrap items-center gap-3">
                <button className="btn" onClick={() => void videoThumbs()} disabled={busy || noFolder}>Faire les miniatures des vidéos</button>
                {stats && <span className="text-sm" style={muted}>{stats.thumbsFailed === 0 ? 'Toutes les miniatures sont prêtes.' : `${nf.format(stats.thumbsFailed)} fichier${stats.thumbsFailed > 1 ? 's' : ''} sans miniature.`}</span>}
              </div>
            </SettingsSection>
            {stats && (
              <SettingsSection title="Ma bibliothèque en chiffres">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Blocs (images, vidéos, carrousels)" value={stats.blocks} />
                  <Stat label="Fichiers" value={stats.files} />
                  <Stat label="Collections automatiques" value={stats.collections} />
                  <Stat label="Fichiers introuvables" value={stats.missing} />
                  <Stat label="Miniatures prêtes" value={stats.thumbsReady} />
                  <Stat label="Miniatures à faire" value={stats.thumbsPending} />
                  <Stat label="Miniatures impossibles" value={stats.thumbsFailed} />
                </div>
              </SettingsSection>
            )}
            <MoveLibrary disabled={busy} />
          </>
        )}

        {part === 'download' && (
          <div className="mb-5 rounded-xl border border-[var(--border)] px-5">
            <SaverSection />
          </div>
        )}

        {part === 'recipes' && <RecipeFolder disabled={busy} />}

        {part === 'ai' && <AiSection />}

        {part === 'clean' && (
          <>
            <SettingsSection title="Doublons" description="Trouve les images en double (identiques ou presque) et te laisse choisir lesquelles garder. Les autres partent dans la Corbeille Windows, jamais effacées pour de bon.">
              <button className="btn" onClick={() => setDupesOpen(true)}>Chercher les doublons</button>
            </SettingsSection>
            <TrashSection onOpen={() => setTrashOpen(true)} />
          </>
        )}
      </div>
    </div>
  )
}