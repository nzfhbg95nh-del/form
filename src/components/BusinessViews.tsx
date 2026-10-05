import { useState } from 'react'
import { Plus } from 'lucide-react'
import {
  centsToInput, clientAddressLines, clientDisplayName, formatEuros, newClient, newService, parseEuros, UNITS, validateClient,
} from '@/lib/business'
import { normalize } from '@/lib/search'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import type { Client, Service } from '@/lib/types'

const field = 'w-full rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]'
const primary = 'rounded bg-[var(--accent)] px-4 py-1.5 text-sm text-white disabled:opacity-40'
const secondary = 'rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)]'

function Row({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('mb-3 block', className)}>
      <span className="mb-1 block text-xs font-medium text-[var(--fg-muted)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--fg-muted)]">{hint}</span>}
    </label>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 py-[6vh]" onMouseDown={onClose}>
      <div
        className="w-[640px] max-w-[92vw] rounded-lg border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2 className="mb-4 text-xl font-bold">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function Toolbar({ title, query, setQuery, showArchived, setShowArchived, onNew, newLabel }: {
  title: string
  query: string
  setQuery: (q: string) => void
  showArchived?: boolean
  setShowArchived?: (v: boolean) => void
  onNew: () => void
  newLabel: string
}) {
  return (
    <>
      <h1 className="mb-4 text-3xl font-bold">{title}</h1>
      <div className="mb-3 flex items-center gap-3">
        <input className={field + ' max-w-xs'} placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {setShowArchived && (
          <label className="flex items-center gap-1.5 text-sm text-[var(--fg-muted)]">
            <input type="checkbox" checked={!!showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Afficher les archivés
          </label>
        )}
        <div className="flex-1" />
        <button className={primary + ' flex items-center gap-1'} onClick={onNew}><Plus size={14} /> {newLabel}</button>
      </div>
    </>
  )
}

// ───────────────────────── Clients ─────────────────────────

function ClientForm({ initial, isNew, onClose }: { initial: Client; isNew: boolean; onClose: () => void }) {
  const saveClient = useApp((s) => s.saveClient)
  const deleteClient = useApp((s) => s.deleteClient)
  const [problem, setProblem] = useState<string | null>(null)
  const [c, setC] = useState<Client>(initial)
  const { errors, warnings } = validateClient(c)
  const set = <K extends keyof Client>(key: K, value: Client[K]) => setC({ ...c, [key]: value })
  const text = (key: 'name' | 'company_name' | 'siren' | 'siret' | 'vat_number' | 'street' | 'postal_code' | 'city' | 'country' | 'email' | 'phone' | 'contact') => (
    <input className={field} value={c[key]} onChange={(e) => set(key, e.target.value)} />
  )
  const done = async (patch: Partial<Client> = {}) => {
    await saveClient({ ...c, ...patch })
    onClose()
  }

  return (
    <Modal title={isNew ? 'Nouveau client' : clientDisplayName(initial)} onClose={onClose}>
      <Row label="Type de client">
        <select className={field} value={c.kind} onChange={(e) => set('kind', e.target.value as Client['kind'])}>
          <option value="pro">Professionnel (entreprise, association…)</option>
          <option value="particulier">Particulier</option>
        </select>
      </Row>
      <div className="grid grid-cols-2 gap-x-4">
        <Row label="Raison sociale">{text('company_name')}</Row>
        <Row label="Nom (personne)">{text('name')}</Row>
        <Row label="SIREN (9 chiffres)">{text('siren')}</Row>
        <Row label="SIRET (14 chiffres)" hint="Le SIREN se remplit tout seul à partir du SIRET.">{text('siret')}</Row>
      </div>
      <Row label="N° de TVA intracommunautaire" hint="Pour un client belge : BE0123456789.">{text('vat_number')}</Row>
      <Row label="Adresse de facturation">{text('street')}</Row>
      <div className="grid grid-cols-3 gap-x-4">
        <Row label="Code postal">{text('postal_code')}</Row>
        <Row label="Ville">{text('city')}</Row>
        <Row label="Pays">{text('country')}</Row>
      </div>
      <div className="grid grid-cols-3 gap-x-4">
        <Row label="E-mail">{text('email')}</Row>
        <Row label="Téléphone">{text('phone')}</Row>
        <Row label="Personne à contacter">{text('contact')}</Row>
      </div>
      <Row label="Notes">
        <textarea className={field + ' h-20'} value={c.notes} onChange={(e) => set('notes', e.target.value)} />
      </Row>

      {problem && <div className="mb-2 rounded border border-red-500/50 p-2 text-sm text-red-500">{problem}</div>}
      {errors.map((e) => <div key={e} className="mb-2 text-sm text-red-500">{e}</div>)}
      {warnings.map((w) => <div key={w} className="mb-2 rounded border border-[var(--border)] p-2 text-xs text-[var(--fg-muted)]">⚠ {w}</div>)}

      <div className="mt-4 flex items-center gap-2">
        <button className={primary} disabled={errors.length > 0} onClick={() => void done()}>Enregistrer</button>
        <button className={secondary} onClick={onClose}>Annuler</button>
        <div className="flex-1" />
        {!isNew && (
          <button
            className={secondary + ' text-red-500'}
            onClick={() => {
              if (!window.confirm(`Supprimer le client « ${clientDisplayName(initial)} » ?`)) return
              void deleteClient(c.id).then((problem) => (problem ? setProblem(problem) : onClose()))
            }}
          >
            Supprimer
          </button>
        )}
      </div>
    </Modal>
  )
}

export function ClientsView() {
  const { clients, editing, setEditing } = useApp()
  const [query, setQuery] = useState('')
  const q = normalize(query).trim()
  const shown = clients
    .filter((c) => q === '' || normalize([c.name, c.company_name, c.email, c.city, c.siren, c.siret, c.contact].join(' ')).includes(q))
    .sort((a, b) => clientDisplayName(a).localeCompare(clientDisplayName(b), 'fr'))
  const edited = editing?.kind === 'client' ? (editing.id ? clients.find((c) => c.id === editing.id) : newClient()) : undefined

  return (
    <div className="mx-auto max-w-5xl px-12 py-10">
      <Toolbar title="Clients" query={query} setQuery={setQuery} newLabel="Nouveau client" onNew={() => setEditing({ kind: 'client', id: null })} />
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--fg-muted)]">
            <th className="py-2 pr-3 font-semibold">Client</th>
            <th className="pr-3 font-semibold">Type</th>
            <th className="pr-3 font-semibold">Adresse</th>
            <th className="pr-3 font-semibold">E-mail</th>
            <th className="font-semibold">SIREN</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((c) => (
            <tr key={c.id} onClick={() => setEditing({ kind: 'client', id: c.id })} className={cn('cursor-pointer border-b border-[var(--border)] hover:bg-[var(--bg-hover)]', '')}>
              <td className="py-2 pr-3 font-medium">{clientDisplayName(c)}</td>
              <td className="pr-3">{c.kind === 'pro' ? 'Pro' : 'Particulier'}</td>
              <td className="pr-3">{clientAddressLines(c).slice(1).join(', ')}</td>
              <td className="pr-3">{c.email}</td>
              <td>{c.siren}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length === 0 && <p className="py-4 text-sm text-[var(--fg-muted)]">{clients.length === 0 ? 'Aucun client pour le moment.' : 'Aucun client ne correspond.'}</p>}
      {edited && <ClientForm key={edited.id} initial={edited} isNew={!editing?.id} onClose={() => setEditing(null)} />}
    </div>
  )
}

// ───────────────────────── Prestations ─────────────────────────

function ServiceForm({ initial, isNew, onClose }: { initial: Service; isNew: boolean; onClose: () => void }) {
  const saveService = useApp((s) => s.saveService)
  const deleteService = useApp((s) => s.deleteService)
  const [s, setS] = useState<Service>(initial)
  const [price, setPrice] = useState(isNew ? '' : centsToInput(initial.unit_price_cents))
  const cents = parseEuros(price)
  const valid = s.label.trim() !== '' && cents !== null
  const done = async (patch: Partial<Service> = {}) => {
    await saveService({ ...s, unit_price_cents: cents ?? 0, ...patch })
    onClose()
  }

  return (
    <Modal title={isNew ? 'Nouveau tarif' : s.label || 'Tarif'} onClose={onClose}>
      <Row label="Libellé"><input className={field} value={s.label} onChange={(e) => setS({ ...s, label: e.target.value })} /></Row>
      <Row label="Description (reprise sur les devis)">
        <textarea className={field + ' h-24'} value={s.description} onChange={(e) => setS({ ...s, description: e.target.value })} />
      </Row>
      <div className="grid grid-cols-2 gap-x-4">
        <Row label="Prix unitaire HT (€)" hint={price !== '' && cents === null ? undefined : 'Pas de TVA : tu es en franchise.'}>
          <input className={field} value={price} placeholder="450,00" onChange={(e) => setPrice(e.target.value)} />
          {price !== '' && cents === null && <span className="mt-1 block text-xs text-red-500">Montant invalide (exemple : 450 ou 450,50).</span>}
        </Row>
        <Row label="Unité">
          <select className={field} value={s.unit} onChange={(e) => setS({ ...s, unit: e.target.value })}>
            {[...new Set([...UNITS, s.unit])].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Row>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button className={primary} disabled={!valid} onClick={() => void done()}>Enregistrer</button>
        <button className={secondary} onClick={onClose}>Annuler</button>
        <div className="flex-1" />
        {!isNew && (
          <button
            className={secondary + ' text-red-500'}
            title="Les devis et factures déjà faits gardent leurs lignes."
            onClick={() => {
              if (window.confirm(`Supprimer le tarif « ${s.label || 'sans libellé'} » ? Les devis et factures déjà faits ne changent pas.`)) {
                void deleteService(s.id).then(onClose)
              }
            }}
          >
            Supprimer
          </button>
        )}
      </div>
    </Modal>
  )
}

export function ServicesView() {
  const { services, editing, setEditing } = useApp()
  const [query, setQuery] = useState('')
  const q = normalize(query).trim()
  const shown = services
    .filter((s) => q === '' || normalize(`${s.label} ${s.description}`).includes(q))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  const edited = editing?.kind === 'service' ? (editing.id ? services.find((s) => s.id === editing.id) : newService()) : undefined

  return (
    <div className="mx-auto max-w-5xl px-12 py-10">
      <Toolbar title="Tarifs" query={query} setQuery={setQuery} newLabel="Nouveau tarif" onNew={() => setEditing({ kind: 'service', id: null })} />
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--fg-muted)]">
            <th className="py-2 pr-3 font-semibold">Prestation</th>
            <th className="pr-3 font-semibold">Description</th>
            <th className="pr-3 text-right font-semibold">Prix HT</th>
            <th className="font-semibold">Unité</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((s) => (
            <tr key={s.id} onClick={() => setEditing({ kind: 'service', id: s.id })} className={cn('cursor-pointer border-b border-[var(--border)] hover:bg-[var(--bg-hover)]', '')}>
              <td className="py-2 pr-3 font-medium">{s.label || 'Sans libellé'}</td>
              <td className="max-w-xs truncate pr-3 text-[var(--fg-muted)]">{s.description}</td>
              <td className="pr-3 text-right tabular-nums">{formatEuros(s.unit_price_cents)}</td>
              <td>{s.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length === 0 && <p className="py-4 text-sm text-[var(--fg-muted)]">{services.length === 0 ? 'Aucune prestation pour le moment.' : 'Aucune prestation ne correspond.'}</p>}
      {edited && <ServiceForm key={edited.id} initial={edited} isNew={!editing?.id} onClose={() => setEditing(null)} />}
    </div>
  )
}
