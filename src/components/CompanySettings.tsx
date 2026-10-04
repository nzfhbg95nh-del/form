import { useEffect, useRef, useState } from 'react'
import { centsToInput, parseEuros } from '@/lib/business'
import { readFileAsDataUrl } from '@/lib/content'
import {
  companyWarnings, defaultCompany, loadCompany, missingForIssuing, saveCompany, vatMention, type Company,
} from '@/lib/company'
import { DEFAULT_CGV, DEFAULT_CGV_DATE } from '@/lib/cgv'
import { REMINDER_FIELDS } from '@/lib/payments'
import { todayISO } from '@/lib/backup'
import { useApp } from '@/store/app'

const field = 'w-full rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]'
const primary = 'rounded bg-[var(--accent)] px-4 py-1.5 text-sm text-white disabled:opacity-40'
const secondary = 'rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)]'

/** Champ de montant en euros, enregistré en centimes. */
function MoneyInput({ value, onChange }: { value: number; onChange: (cents: number) => void }) {
  const [text, setText] = useState(centsToInput(value))
  const ok = parseEuros(text) !== null
  return (
    <input
      className={field + (ok ? '' : ' border-red-500')}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { const c = parseEuros(text); if (c !== null) onChange(c); else setText(centsToInput(value)) }}
    />
  )
}

function useCompany() {
  const repo = useApp((s) => s.repo)
  const [company, setCompany] = useState<Company | null>(null)
  const [saved, setSaved] = useState<Company | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (repo) void loadCompany(repo).then((c) => { setCompany(c); setSaved(c) })
  }, [repo])

  const save = async (next: Company) => {
    if (!repo) return
    await saveCompany(repo, next)
    useApp.getState().setCompany(next)
    setSaved(next)
    setMessage('Modifications enregistrées.')
    window.setTimeout(() => setMessage(null), 2500)
  }
  const dirty = company !== null && saved !== null && JSON.stringify(company) !== JSON.stringify(saved)
  return { company, setCompany, save, dirty, message }
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium text-[var(--fg-muted)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--fg-muted)]">{hint}</span>}
    </label>
  )
}

export function CompanySettings() {
  const { company, setCompany, save, dirty, message } = useCompany()
  const logoInput = useRef<HTMLInputElement>(null)
  if (!company) return <div className="px-12 py-10 text-[var(--fg-muted)]">Chargement…</div>

  const set = <K extends keyof Company>(key: K, value: Company[K]) => setCompany({ ...company, [key]: value })
  const text = (key: 'legalName' | 'tradeName' | 'statusMention' | 'siret' | 'street' | 'postalCode' | 'city' | 'country' | 'phone' | 'email' | 'iban' | 'bic') => (
    <input className={field} value={company[key]} onChange={(e) => set(key, e.target.value)} />
  )
  const num = (key: 'paymentDays' | 'quoteValidityDays' | 'depositPercent' | 'recoveryFee' | 'reminderAfterDays') => (
    <input
      className={field}
      type="number"
      min={0}
      value={company[key]}
      onChange={(e) => set(key, Math.max(0, Number(e.target.value) || 0))}
    />
  )
  const missing = missingForIssuing(company)
  const warnings = companyWarnings(company)
  const today = todayISO()

  return (
    <div className="mx-auto max-w-3xl px-12 py-10">
      <h1 className="mb-1 text-3xl font-bold">Entreprise</h1>
      <p className="mb-6 text-sm text-[var(--fg-muted)]">Ces informations sont reprises automatiquement sur tous tes devis et factures.</p>

      {missing.length > 0 ? (
        <div className="mb-3 rounded border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
          <strong>Pour émettre une vraie facture, il manque :</strong> {missing.join(', ')}.
          <div className="mt-1 text-xs text-[var(--fg-muted)]">En attendant, tu peux préparer des devis et des factures en brouillon.</div>
        </div>
      ) : (
        <div className="mb-3 rounded border border-green-600/40 bg-green-600/10 p-3 text-sm">Les mentions obligatoires sont complètes.</div>
      )}
      {warnings.map((w) => (
        <div key={w} className="mb-2 rounded border border-[var(--border)] p-2 text-xs text-[var(--fg-muted)]">⚠ {w}</div>
      ))}

      <h2 className="mb-2 mt-6 text-lg font-semibold">Identité</h2>
      <div className="grid grid-cols-2 gap-x-4">
        <Row label="Nom légal">{text('legalName')}</Row>
        <Row label="Nom commercial (en-tête des documents)">{text('tradeName')}</Row>
        <Row label="Mention de statut" hint="« Entrepreneur individuel » ou « EI » : obligatoire.">{text('statusMention')}</Row>
        <Row label="SIRET" hint="14 chiffres. Pas encore reçu ? Laisse vide : tu peux faire des devis ; seule l'émission d'une vraie facture sera bloquée.">{text('siret')}</Row>
      </div>

      <h2 className="mb-2 mt-4 text-lg font-semibold">Adresse</h2>
      <p className="mb-2 text-xs text-[var(--fg-muted)]">Provisoire : à remplacer par l'adresse de domiciliation quand elle sera confirmée.</p>
      <Row label="Rue et numéro">{text('street')}</Row>
      <div className="grid grid-cols-3 gap-x-4">
        <Row label="Code postal">{text('postalCode')}</Row>
        <Row label="Ville">{text('city')}</Row>
        <Row label="Pays">{text('country')}</Row>
      </div>
      <div className="grid grid-cols-2 gap-x-4">
        <Row label="Téléphone">{text('phone')}</Row>
        <Row label="E-mail">{text('email')}</Row>
      </div>

      <h2 className="mb-2 mt-4 text-lg font-semibold">Paiement</h2>
      <div className="grid grid-cols-2 gap-x-4">
        <Row label="IBAN">{text('iban')}</Row>
        <Row label="BIC (facultatif)">{text('bic')}</Row>
      </div>

      <h2 className="mb-2 mt-4 text-lg font-semibold">Conditions par défaut</h2>
      <div className="grid grid-cols-3 gap-x-4">
        <Row label="Délai de paiement (jours)">{num('paymentDays')}</Row>
        <Row label="Validité d'un devis (jours)">{num('quoteValidityDays')}</Row>
        <Row label="Acompte (%)">{num('depositPercent')}</Row>
      </div>
      <Row label="Pénalités de retard" hint="Taux obligatoire sur les factures.">
        <input className={field} value={company.latePenalty} onChange={(e) => set('latePenalty', e.target.value)} />
      </Row>
      <div className="grid grid-cols-2 gap-x-4">
        <Row label="Indemnité forfaitaire de recouvrement (€)" hint="40 € pour les clients professionnels.">{num('recoveryFee')}</Row>
        <Row label="Mention d'escompte">
          <input className={field} value={company.discountMention} onChange={(e) => set('discountMention', e.target.value)} />
        </Row>
      </div>

      <h2 className="mb-2 mt-4 text-lg font-semibold">TVA</h2>
      <p className="mb-2 text-sm">
        Mention appliquée aujourd'hui : <strong>{vatMention(company, today)}</strong>
      </p>
      <p className="mb-2 text-xs text-[var(--fg-muted)]">
        Elle change automatiquement le 1er janvier 2027 (art. 293 B du CGI → art. L. 233-1 du CIBS). Tu peux la remplacer :
      </p>
      <Row label="Mention personnalisée (laisser vide pour l'automatique)">
        <input className={field} value={company.vatMentionOverride} onChange={(e) => set('vatMentionOverride', e.target.value)} />
      </Row>

      <h2 className="mb-2 mt-4 text-lg font-semibold">Clients hors de France (Belgique…)</h2>
      <div className="mb-2 rounded border border-yellow-500/50 bg-yellow-500/10 p-2 text-xs">
        ⚠ La mention à écrire sur les factures de clients belges est à faire valider par un comptable.
      </div>
      <Row label="Mention spécifique">
        <textarea className={field + ' h-16'} value={company.foreignClientMention} onChange={(e) => set('foreignClientMention', e.target.value)} />
      </Row>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={company.foreignClientMentionConfirmed} onChange={(e) => set('foreignClientMentionConfirmed', e.target.checked)} />
        Cette mention a été confirmée par un comptable
      </label>

      <h2 className="mb-2 mt-4 text-lg font-semibold">Plafonds et seuils (alertes du tableau de bord)</h2>
      <div className="mb-2 rounded border border-yellow-500/50 bg-yellow-500/10 p-2 text-xs">
        ⚠ Ces montants sont des valeurs de départ pour une activité de <strong>prestations de services</strong>. Ils changent selon les lois de finances :
        <strong> vérifie-les sur service-public.fr ou avec un comptable</strong>, corrige-les si besoin, puis coche la case de confirmation.
      </div>
      <div className="grid grid-cols-3 gap-x-4">
        <Row label="Plafond de CA micro-entreprise (€)"><MoneyInput value={company.microCeilingCents} onChange={(v) => set('microCeilingCents', v)} /></Row>
        <Row label="Seuil de franchise de TVA (€)"><MoneyInput value={company.vatBaseCents} onChange={(v) => set('vatBaseCents', v)} /></Row>
        <Row label="Seuil de TVA majoré (€)"><MoneyInput value={company.vatMajoredCents} onChange={(v) => set('vatMajoredCents', v)} /></Row>
      </div>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={company.thresholdsConfirmed} onChange={(e) => set('thresholdsConfirmed', e.target.checked)} />
        J'ai vérifié ces montants
      </label>

      <h2 className="mb-2 mt-4 text-lg font-semibold">Relances de paiement</h2>
      <p className="mb-2 text-xs text-[var(--fg-muted)]">
        Form te propose de relancer une facture impayée quelques jours après son échéance. Il prépare le message : c'est toi qui l'envoies. Mots remplacés automatiquement : {REMINDER_FIELDS.join(' ')}.
      </p>
      <Row label="Proposer une relance après (jours de retard)">{num('reminderAfterDays')}</Row>
      <Row label="Objet du message">
        <input className={field} value={company.reminderSubject} onChange={(e) => set('reminderSubject', e.target.value)} />
      </Row>
      <Row label="Texte du message">
        <textarea className={field + ' h-48 text-xs'} value={company.reminderBody} onChange={(e) => set('reminderBody', e.target.value)} />
      </Row>

      <h2 className="mb-2 mt-4 text-lg font-semibold">Logo</h2>
      <div className="mb-6 flex items-center gap-3">
        {company.logo ? <img src={company.logo} alt="Logo" className="h-16 rounded border border-[var(--border)]" /> : <span className="text-sm text-[var(--fg-muted)]">Aucun logo</span>}
        <button className={secondary} onClick={() => logoInput.current?.click()}>Choisir une image…</button>
        {company.logo && <button className={secondary} onClick={() => set('logo', null)}>Retirer</button>}
        <input
          ref={logoInput}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) set('logo', await readFileAsDataUrl(f))
            e.target.value = ''
          }}
        />
      </div>

      <div className="sticky bottom-0 -mx-12 flex items-center gap-3 border-t border-[var(--border)] bg-[var(--bg)] px-12 py-3">
        <button className={primary} disabled={!dirty} onClick={() => void save(company)}>Enregistrer</button>
        <button className={secondary} disabled={!dirty} onClick={() => window.location.reload()}>Annuler les modifications</button>
        {message && <span className="text-sm text-green-600">{message}</span>}
        {dirty && !message && <span className="text-sm text-[var(--fg-muted)]">Modifications non enregistrées</span>}
      </div>
    </div>
  )
}

export function CgvSettings() {
  const { company, setCompany, save, dirty, message } = useCompany()
  if (!company) return <div className="px-12 py-10 text-[var(--fg-muted)]">Chargement…</div>

  return (
    <div className="mx-auto max-w-3xl px-12 py-10">
      <h1 className="mb-1 text-3xl font-bold">Conditions générales de vente</h1>
      <p className="mb-4 text-sm text-[var(--fg-muted)]">
        Ce texte sera joint en dernière page de chaque devis. Dernière mise à jour : {company.cgvDate.split('-').reverse().join('/')}.
        Chaque article commence par « ARTICLE n - TITRE », les points par « * » et les sous-points par « - ».
      </p>
      <textarea
        className={field + ' h-[60vh] font-mono text-xs leading-relaxed'}
        value={company.cgv}
        onChange={(e) => setCompany({ ...company, cgv: e.target.value })}
      />
      <div className="mt-3 flex items-center gap-3">
        <button className={primary} disabled={!dirty} onClick={() => void save({ ...company, cgvDate: todayISO() })}>Enregistrer</button>
        <button
          className={secondary}
          onClick={() => {
            if (window.confirm("Remettre le texte d'origine (version du 20/11/2025) ? Tes modifications seront perdues.")) {
              setCompany({ ...defaultCompany(), ...company, cgv: DEFAULT_CGV, cgvDate: DEFAULT_CGV_DATE })
            }
          }}
        >
          Rétablir le texte d'origine
        </button>
        {message && <span className="text-sm text-green-600">{message}</span>}
      </div>
    </div>
  )
}
