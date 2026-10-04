export interface ObjectRow {
  id: string
  type: string
  parent_id: string | null
  title: string
  icon: string | null
  cover: string | null
  properties: string
  content: string | null
  position: number
  is_favorite: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type ObjectPatch = Partial<
  Pick<ObjectRow, 'title' | 'icon' | 'cover' | 'content' | 'is_favorite' | 'deleted_at' | 'parent_id' | 'position' | 'properties'>
>

/** Tout ce que l'app sait faire avec la base. Deux versions : SQLite (vraie app) et navigateur (tests). */
export interface Client {
  id: string
  /** « pro » : professionnel (l'indemnité de recouvrement de 40 € s'applique) ou « particulier ». */
  kind: 'pro' | 'particulier'
  name: string
  company_name: string
  siren: string
  siret: string
  /** Numéro de TVA intracommunautaire. */
  vat_number: string
  street: string
  postal_code: string
  city: string
  country: string
  email: string
  phone: string
  contact: string
  notes: string
  created_at: string
  updated_at: string
  archived_at: string | null
}

export interface Service {
  id: string
  label: string
  description: string
  /** Prix unitaire HT en centimes d'euro : jamais de nombres à virgule pour l'argent. */
  unit_price_cents: number
  unit: string
  created_at: string
  updated_at: string
  archived_at: string | null
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'refused'

export interface Quote {
  id: string
  /** Vide tant que le devis est un brouillon ; attribué à l'envoi, jamais modifié ensuite. */
  number: string | null
  status: QuoteStatus
  client_id: string | null
  title: string
  issue_date: string
  valid_until: string
  deposit_percent: number
  payment_days: number
  included_revisions: number | null
  notes: string
  /** Photo figée (entreprise, client, mention de TVA) prise à l'envoi. */
  snapshot: string | null
  created_at: string
  updated_at: string
}

export interface QuoteLine {
  id: string
  quote_id: string
  position: number
  service_id: string | null
  label: string
  description: string
  /** Quantité en millièmes : 1 jour = 1000, 2,5 jours = 2500. */
  quantity_milli: number
  unit: string
  unit_price_cents: number
}

export type InvoiceKind = 'deposit' | 'final' | 'standard' | 'credit'
export type InvoiceStatus = 'draft' | 'issued' | 'paid'

export interface Invoice {
  id: string
  number: string | null
  kind: InvoiceKind
  status: InvoiceStatus
  client_id: string | null
  quote_id: string | null
  /** Pour un avoir : la facture qu'il corrige. */
  related_invoice_id: string | null
  title: string
  issue_date: string
  service_date: string
  service_date_end: string | null
  due_date: string
  payment_days: number
  notes: string
  snapshot: string | null
  created_at: string
  updated_at: string
}

export interface InvoiceLine {
  id: string
  invoice_id: string
  position: number
  /** « deposit_deduction » : ligne négative « acompte déjà facturé » d'une facture de solde. */
  line_kind: 'item' | 'deposit_deduction'
  service_id: string | null
  label: string
  description: string
  quantity_milli: number
  unit: string
  /** Négatif sur un avoir. */
  unit_price_cents: number
}

export type PaymentMethod = 'transfer' | 'card' | 'cash' | 'cheque' | 'other'

export interface Payment {
  id: string
  invoice_id: string
  paid_on: string
  /** Montant encaissé en centimes (toujours positif). */
  amount_cents: number
  method: PaymentMethod
  note: string
  created_at: string
}

export interface AuditEntry {
  id: number
  at: string
  entity: string
  entity_id: string
  number: string | null
  action: string
  detail: string
}

export interface IssueInvoiceInput {
  id: string
  /** Début du numéro : « F-2026- » ou « A-2026- » pour un avoir. */
  prefix: string
  issueDate: string
  dueDate: string
  snapshot: string
}

export interface IssueQuoteInput {
  id: string
  /** Début du numéro, par exemple « D-2026- ». */
  prefix: string
  issueDate: string
  validUntil: string
  snapshot: string
}

export interface Repo {
  listPayments(): Promise<Payment[]>
  /** Enregistre un encaissement (refusé sur un brouillon ou un avoir). */
  addPayment(payment: Payment): Promise<void>
  /** Supprime un paiement : l'opération est inscrite au journal. */
  deletePayment(id: string): Promise<void>
  listInvoices(): Promise<Invoice[]>
  listInvoiceLines(): Promise<InvoiceLine[]>
  saveInvoiceDraft(invoice: Invoice, lines: InvoiceLine[]): Promise<void>
  /** Numéro continu sans trou ; refuse une date antérieure à celle d'une facture déjà émise. */
  issueInvoice(input: IssueInvoiceInput): Promise<string>
  setInvoiceStatus(id: string, status: Exclude<InvoiceStatus, 'draft'>): Promise<void>
  deleteDraftInvoice(id: string): Promise<void>
  listAuditLog(entityId?: string): Promise<AuditEntry[]>
  logAudit(entry: { entity: string; entityId: string; number: string | null; action: string; detail: string }): Promise<void>
  listQuotes(): Promise<Quote[]>
  listQuoteLines(): Promise<QuoteLine[]>
  /** Enregistre un brouillon et ses lignes. Refuse si le devis a déjà un numéro. */
  saveQuoteDraft(quote: Quote, lines: QuoteLine[]): Promise<void>
  /** Attribue le prochain numéro libre (continu, sans trou) et fige le devis. Renvoie le numéro. */
  issueQuote(input: IssueQuoteInput): Promise<string>
  setQuoteStatus(id: string, status: Exclude<QuoteStatus, 'draft'>): Promise<void>
  deleteDraftQuote(id: string): Promise<void>
  listClients(): Promise<Client[]>
  saveClient(client: Client): Promise<void>
  listServices(): Promise<Service[]>
  saveService(service: Service): Promise<void>
  listObjects(): Promise<ObjectRow[]>
  createPage(parentId?: string | null, type?: string, properties?: string): Promise<ObjectRow>
  updateObject(id: string, patch: ObjectPatch): Promise<void>
  purgeObject(id: string): Promise<void>
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>
  /** Copie complète et cohérente de la base vers un fichier. */
  backupTo(filePath: string): Promise<void>
}
