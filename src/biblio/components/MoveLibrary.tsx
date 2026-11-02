import { open } from '@tauri-apps/plugin-dialog'
import { FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { cancelMove, previewMove, runMove } from '@/biblio/lib/relocate.ts'
import {
  describePreview, describeProgress, describeResult, destinationFor, moveSucceeded, progressPercent,
  type MovePreview, type MoveProgress, type MoveResult,
} from '@/biblio/lib/relocatePure.ts'
import { useLibrary } from '@/biblio/store/library.ts'

type Step =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'confirm'; to: string; preview: MovePreview }
  | { kind: 'moving'; to: string; progress: MoveProgress | null }
  | { kind: 'done'; to: string; result: MoveResult; switched: boolean }

/**
 * « Déplacer ma bibliothèque… » : copie tout le dossier (instagram, pinterest, images ajoutées, cache…) vers un nouvel emplacement,
 * vérifie chaque fichier, puis pointe l'appli vers le nouveau dossier. L'ancien dossier n'est jamais touché ni effacé.
 */
export function MoveLibrary({ disabled }: { disabled: boolean }) {
  const root = useLibrary((s) => s.root)
  const setRoot = useLibrary((s) => s.setRoot)
  const update = useLibrary((s) => s.update)
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)

  const pick = async () => {
    setError(null)
    const picked = await open({ directory: true, title: 'Où ranger la Bibliothèque Form ? (un dossier « Bibliothèque Form » y sera créé)' })
    if (typeof picked !== 'string') return
    const to = destinationFor(picked)
    setStep({ kind: 'checking' })
    try {
      setStep({ kind: 'confirm', to, preview: await previewMove(root, to) })
    } catch (e) {
      setStep({ kind: 'idle' })
      setError(String(e))
    }
  }

  const start = async (to: string) => {
    setStep({ kind: 'moving', to, progress: null })
    try {
      const result = await runMove(root, to, (progress) => setStep((s) => (s.kind === 'moving' ? { ...s, progress } : s)))
      const ok = moveSucceeded(result)
      // Seulement si tout est bien copié : l'appli pointe vers le nouveau dossier, puis relit la bibliothèque pour le vérifier.
      if (ok) {
        await setRoot(to)
        void update()
      }
      setStep({ kind: 'done', to, result, switched: ok })
    } catch (e) {
      setStep({ kind: 'idle' })
      setError(String(e))
    }
  }

  const muted = { color: 'var(--fg-muted)' }

  return (
    <section className="mt-6">
      <div className="text-xs font-medium uppercase tracking-wide" style={muted}>Déplacer la bibliothèque</div>
      <p className="mt-2 text-sm" style={muted}>
        Copie tout le dossier (Instagram, Pinterest, images ajoutées, recettes, cache) vers un autre disque ou dossier, vérifie chaque fichier, puis Form s'y rend. L'ancien dossier reste intact : tu l'effaceras toi-même quand tu auras vérifié. Un déplacement interrompu reprend là où il s'est arrêté.
      </p>

      {(step.kind === 'idle' || step.kind === 'checking') && (
        <button className="btn mt-3" onClick={() => void pick()} disabled={disabled || step.kind === 'checking'}>
          <FolderOpen size={16} /> {step.kind === 'checking' ? 'Vérification…' : 'Déplacer ma bibliothèque…'}
        </button>
      )}

      {step.kind === 'confirm' && (
        <div className="mt-3 rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--border)' }}>
          <div>Nouvel emplacement : <span className="font-medium break-all">{step.to}</span></div>
          <div className="mt-1" style={muted}>{describePreview(step.preview)}</div>
          {step.preview.error && <div className="mt-2" style={{ color: '#d44c47' }}>{step.preview.error}</div>}
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary" disabled={!step.preview.ok} onClick={() => void start(step.to)}>Copier la bibliothèque</button>
            <button className="btn" onClick={() => setStep({ kind: 'idle' })}>Annuler</button>
          </div>
        </div>
      )}

      {step.kind === 'moving' && (
        <div className="mt-3 rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--border)' }}>
          <div className="break-all">Copie vers {step.to}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--bg-hover)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${step.progress ? progressPercent(step.progress) : 100}%`, background: 'var(--accent)', opacity: step.progress ? 1 : 0.4 }} />
          </div>
          <div className="mt-1 text-xs" style={muted}>{step.progress ? describeProgress(step.progress) : 'Préparation…'}</div>
          {step.progress && <div className="mt-0.5 truncate text-xs" style={muted}>{step.progress.current}</div>}
          <button className="btn mt-3" onClick={() => void cancelMove()}>Arrêter</button>
        </div>
      )}

      {step.kind === 'done' && (
        <div className="mt-3 rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--border)' }}>
          <div>{describeResult(step.result)}</div>
          {step.switched && <div className="mt-1" style={muted}>Form pointe maintenant vers {step.to} et relit la bibliothèque.</div>}
          {step.result.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs" style={{ color: '#d44c47' }}>
              {step.result.errors.slice(0, 5).map((e, i) => <li key={i} className="break-all">{e}</li>)}
            </ul>
          )}
          <button className="btn mt-3" onClick={() => setStep({ kind: 'idle' })}>OK</button>
        </div>
      )}

      {error && <p className="mt-3 text-sm" style={{ color: '#d44c47' }}>{error}</p>}
    </section>
  )
}
