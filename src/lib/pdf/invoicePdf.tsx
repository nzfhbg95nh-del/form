import { Document, Page, pdf, Text, View } from '@react-pdf/renderer'
import { formatDateFr, lineTotalCents } from '../quotes'
import { invoiceTotalCents } from '../invoices'
import type { Client, Invoice, InvoiceLine } from '../types'
import type { Company } from '../company'
import { BLUE, Header, ItemsTable, money, PAPER, PartyBoxes, rule, SAND, styles, TotalRow, up, type Palette } from './common'

export interface InvoicePdfData {
  invoice: Invoice
  lines: InvoiceLine[]
  company: Omit<Company, 'logo'>
  logo: string | null
  client: Client
  vatMention: string
  quoteNumber: string | null
  relatedNumber: string | null
}

const PALETTES: Record<Invoice['kind'], Palette> = { deposit: PAPER, final: BLUE, standard: BLUE, credit: SAND }
const NUMBER_LABEL: Record<Invoice['kind'], string> = {
  deposit: "Numéro de facture d'acompte", final: 'Numéro de facture', standard: 'Numéro de facture', credit: "Numéro d'avoir",
}
const TOTAL_LABEL: Record<Invoice['kind'], string> = {
  deposit: 'Total à payer :', final: 'Total à payer :', standard: 'Total à payer :', credit: "Total de l'avoir :",
}

function InvoicePage({ d }: { d: InvoicePdfData }) {
  const { invoice, company, client } = d
  const p = PALETTES[invoice.kind]
  const s = styles(p.ink)
  const credit = invoice.kind === 'credit'
  const items = d.lines.filter((l) => l.line_kind === 'item')
  const deductions = d.lines.filter((l) => l.line_kind === 'deposit_deduction')
  const subtotal = items.reduce((sum, l) => sum + lineTotalCents(l), 0)
  const total = invoiceTotalCents(d.lines)
  const service = invoice.service_date_end
    ? `du ${formatDateFr(invoice.service_date)} au ${formatDateFr(invoice.service_date_end)}`
    : formatDateFr(invoice.service_date)
  const fields: [string, string][] = [
    ['Date', formatDateFr(invoice.issue_date)],
    [NUMBER_LABEL[invoice.kind], invoice.number ?? 'BROUILLON (NON NUMÉROTÉ)'],
    ...(credit ? [] : ([["Date d'échéance", `${formatDateFr(invoice.due_date)} (${invoice.payment_days} jours)`]] as [string, string][])),
    ['Date de la prestation', service],
  ]
  const foreign = client.country.trim() !== '' && client.country.trim().toLowerCase() !== 'france'

  return (
    <Page size="A4" style={{ ...s.page, backgroundColor: p.bg }}>
      <Header p={p} company={company} logo={d.logo} fields={fields} />
      <PartyBoxes p={p} company={company} client={client} />

      {invoice.title.trim() !== '' && <Text style={{ marginTop: 14, ...s.bold }}>OBJET : {up(invoice.title)}</Text>}
      {d.quoteNumber && <Text style={{ marginTop: 2 }}>RÉFÉRENCE : DEVIS {up(d.quoteNumber)}</Text>}
      {credit && d.relatedNumber && <Text style={{ marginTop: 2, ...s.bold }}>AVOIR SUR LA FACTURE {up(d.relatedNumber)}</Text>}

      <ItemsTable p={p} lines={items} />

      <View wrap={false} style={{ marginTop: 10 }}>
        <TotalRow p={p} label="Sous-total HT" cents={subtotal} />
        {deductions.map((l) => <TotalRow key={l.id} p={p} label={l.label} cents={lineTotalCents(l)} />)}
        <View style={{ ...rule(p.ink), paddingVertical: 2 }}><Text>{up(d.vatMention)}</Text></View>
        <TotalRow p={p} label={TOTAL_LABEL[invoice.kind]} cents={total} bold />
      </View>

      <View wrap={false} style={{ marginTop: 22, width: 281 }}>
        {invoice.notes.trim() !== '' && <Text style={{ marginBottom: 6 }}>{up(invoice.notes)}</Text>}
        {!credit && (
          <>
            <Text>LE PAIEMENT EST À EFFECTUER DANS LES {invoice.payment_days} JOURS, AVANT LE {formatDateFr(invoice.due_date)}, SUR LE COMPTE :</Text>
            <Text>IBAN {up(company.iban || 'XXXX XXXX XXXX XXXX XXXX X')}{company.bic ? `   BIC ${up(company.bic)}` : ''}</Text>
            <Text style={{ marginTop: 10 }}>
              EN CAS DE RETARD DE PAIEMENT : PÉNALITÉS ÉGALES À {up(company.latePenalty)}
              {client.kind === 'pro' ? `, ET INDEMNITÉ FORFAITAIRE POUR FRAIS DE RECOUVREMENT DE ${company.recoveryFee} €` : ''}.
            </Text>
            <Text>{up(company.discountMention)}.</Text>
          </>
        )}
        <Text style={{ marginTop: 10 }}>NATURE DE L’OPÉRATION : PRESTATION DE SERVICES.</Text>
        {foreign && company.foreignClientMention.trim() !== '' && <Text style={{ marginTop: 6 }}>{up(company.foreignClientMention)}</Text>}
      </View>
    </Page>
  )
}

export function InvoiceDocument({ d }: { d: InvoicePdfData }) {
  return (
    <Document title={d.invoice.number ?? 'Facture (brouillon)'} author={d.company.legalName}>
      <InvoicePage d={d} />
    </Document>
  )
}

export async function renderInvoicePdf(d: InvoicePdfData): Promise<Blob> {
  return pdf(<InvoiceDocument d={d} />).toBlob()
}

export { money }
