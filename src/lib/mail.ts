import { newId, type Schema } from './database'
import { isTauri } from './repo'
import type { Repo } from './types'

// ───────────────────────── Réglages de la messagerie ─────────────────────────

export interface MailConfig {
  provider: 'gmail' | 'outlook' | 'other'
  host: string
  /** Toujours 993 (connexion chiffrée). */
  port: number
  user: string
  folder: string
  /** Nombre de messages récents examinés à chaque relève. */
  scanLast: number
  /** Un expéditeur dont l'adresse ou le nom contient un de ces mots est reconnu (ex. « sedomicilier »). */
  senders: string[]
  /** Un objet qui contient un de ces mots est reconnu. */
  subjects: string[]
  /** Relève automatique au démarrage et toutes les 30 minutes. */
  auto: boolean
}

export const PRESETS: Record<MailConfig['provider'], { label: string; host: string }> = {
  gmail: { label: 'Gmail', host: 'imap.gmail.com' },
  outlook: { label: 'Outlook / Hotmail', host: 'outlook.office365.com' },
  other: { label: 'Autre fournisseur', host: '' },
}

export function defaultMailConfig(): MailConfig {
  return { provider: 'gmail', host: 'imap.gmail.com', port: 993, user: '', folder: 'INBOX', scanLast: 200, senders: ['sedomicilier'], subjects: [], auto: false }
}

const KEY = 'mail_config'

export async function loadMailConfig(repo: Repo): Promise<MailConfig> {
  try {
    const raw = await repo.getSetting(KEY)
    return { ...defaultMailConfig(), ...(raw ? JSON.parse(raw) : {}) }
  } catch {
    return defaultMailConfig()
  }
}

export const saveMailConfig = (repo: Repo, c: MailConfig) => repo.setSetting(KEY, JSON.stringify(c))

/** Texte « mot1, mot2 » -> liste propre. */
export function splitList(text: string): string[] {
  return [...new Set(text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean))]
}

/** Ce qui empêche d'utiliser la configuration. */
export function configProblems(c: MailConfig): string[] {
  const problems: string[] = []
  if (!/^[A-Za-z0-9.-]{3,100}$/.test(c.host)) problems.push('Le nom du serveur est invalide.')
  if (c.port !== 993) problems.push('Seule la connexion chiffrée (port 993) est acceptée.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.user.trim())) problems.push("L'adresse e-mail est invalide.")
  if (!c.folder.trim()) problems.push('Indique le dossier à lire (INBOX par défaut).')
  if (c.senders.length === 0 && c.subjects.length === 0) problems.push("Indique au moins un expéditeur ou un mot de l'objet à reconnaître.")
  return problems
}

// ───────────────────────── Messages ─────────────────────────

export interface MailItem {
  uid: number
  message_id: string
  from: string
  subject: string
  date: string
  snippet: string
  attachments: string[]
  matched: boolean
}

declare global {
  interface Window {
    /** Essais dans le navigateur uniquement : simule la messagerie. */
    __FORM_MAIL_MOCK?: (onlyMatches: boolean) => Promise<MailItem[]>
  }
}

async function invoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke: call } = await import('@tauri-apps/api/core')
  try {
    return await call<T>(command, args)
  } catch (e) {
    throw new Error(typeof e === 'string' ? e : e instanceof Error ? e.message : String(e))
  }
}

export const mailAvailable = () => isTauri() || !!window.__FORM_MAIL_MOCK

export async function mailPasswordSaved(): Promise<boolean> {
  return isTauri() ? invoke<boolean>('secret_exists', { name: 'mail_password' }) : !!window.__FORM_MAIL_MOCK
}
export const saveMailPassword = (password: string) => invoke<void>('secret_set', { name: 'mail_password', value: password })
export const deleteMailPassword = () => invoke<void>('secret_delete', { name: 'mail_password' })

export async function testMail(c: MailConfig): Promise<string> {
  if (!isTauri()) {
    if (window.__FORM_MAIL_MOCK) return 'Connexion réussie (simulation).'
    throw new Error("Le courrier n'est disponible que dans l'application Windows.")
  }
  return invoke<string>('mail_test', { host: c.host, port: c.port, user: c.user.trim(), folder: c.folder })
}

export async function fetchMail(c: MailConfig, onlyMatches: boolean, limit = 50): Promise<MailItem[]> {
  if (!isTauri()) {
    if (window.__FORM_MAIL_MOCK) return window.__FORM_MAIL_MOCK(onlyMatches)
    throw new Error("Le courrier n'est disponible que dans l'application Windows.")
  }
  return invoke<MailItem[]>('mail_fetch', {
    host: c.host, port: c.port, user: c.user.trim(), folder: c.folder, scanLast: c.scanLast,
    senders: c.senders, subjects: c.subjects, onlyMatches, limit,
  })
}

// ───────────────────────── Base « Courrier » ─────────────────────────

export const MAIL = { date: 'date', from: 'expediteur', status: 'statut', files: 'pj', preview: 'apercu', mid: 'mid' } as const

export function mailSchema(): Schema {
  return {
    kind: 'mail',
    columns: [
      { id: MAIL.date, name: 'Date', type: 'date' },
      { id: MAIL.from, name: 'Expéditeur', type: 'text' },
      {
        id: MAIL.status, name: 'Statut', type: 'select',
        options: [{ id: 'atraiter', label: 'À traiter', color: '#fadec9' }, { id: 'traite', label: 'Traité', color: '#dbeddb' }],
      },
      { id: MAIL.files, name: 'Pièces jointes', type: 'text' },
      { id: MAIL.preview, name: 'Aperçu', type: 'text' },
    ],
    views: [
      { id: newId(), name: 'À traiter', type: 'table', filters: [{ id: newId(), colId: MAIL.status, op: 'is', value: 'atraiter' }], sorts: [{ colId: MAIL.date, dir: 'desc' }] },
      { id: newId(), name: 'Tout le courrier', type: 'table', filters: [], sorts: [{ colId: MAIL.date, dir: 'desc' }] },
    ],
  }
}

/** Valeurs d'une ligne « courrier ». L'identifiant du message (mid) sert à ne jamais créer deux fois la même ligne. */
export function rowFromMail(m: MailItem): { title: string; values: Record<string, unknown> } {
  return {
    title: m.subject.trim() || '(sans objet)',
    values: {
      [MAIL.date]: m.date || null,
      [MAIL.from]: m.from,
      [MAIL.status]: 'atraiter',
      [MAIL.files]: m.attachments.join(', '),
      [MAIL.preview]: m.snippet,
      [MAIL.mid]: m.message_id,
    },
  }
}

/** Messages reconnus qui n'ont pas encore de ligne, dans l'ordre du plus ancien au plus récent. */
export function newMailItems(items: MailItem[], knownIds: Set<string>): MailItem[] {
  const seen = new Set(knownIds)
  const fresh: MailItem[] = []
  for (const m of items) {
    if (!m.matched || seen.has(m.message_id)) continue
    seen.add(m.message_id)
    fresh.push(m)
  }
  return fresh.sort((a, b) => a.date.localeCompare(b.date) || a.uid - b.uid)
}
