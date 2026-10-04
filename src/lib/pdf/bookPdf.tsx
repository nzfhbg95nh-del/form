import { Document, Page, pdf, Text, View } from '@react-pdf/renderer'
import { formatDateFr } from '../quotes'
import { bookTotalCents, METHOD_LABELS, type BookRow } from '../payments'
import type { Company } from '../company'
import { Header, money, PAPER, rule, styles, up } from './common'

export interface BookPdfData {
  company: Omit<Company, 'logo'>
  year: number
  rows: BookRow[]
}

function BookPage({ d }: { d: BookPdfData }) {
  const s = styles(PAPER.ink)
  const fields: [string, string][] = [
    ['Document', `Livre des recettes ${d.year}`],
    ['Établi par', d.company.legalName],
    ['SIRET', d.company.siret || "en cours d'obtention"],
  ]
  const cols = { date: 62, client: 150, invoice: 80, method: 90, amount: 70 }

  return (
    <Page size="A4" style={{ ...s.page, backgroundColor: PAPER.bg }}>
      <View fixed><Header p={PAPER} company={d.company} logo={null} fields={fields} /></View>
      <View style={{ marginTop: 30 }}>
        <View style={{ ...s.row, ...rule(PAPER.ink), borderTopWidth: 0.5, borderTopColor: PAPER.ink, paddingVertical: 3 }} fixed>
          <Text style={{ width: cols.date }}>DATE</Text>
          <Text style={{ width: cols.client }}>CLIENT</Text>
          <Text style={{ width: cols.invoice }}>N° FACTURE</Text>
          <Text style={{ width: cols.method }}>MOYEN</Text>
          <Text style={{ width: cols.amount, textAlign: 'right' }}>MONTANT</Text>
        </View>
        {d.rows.map((r) => (
          <View key={r.payment.id} wrap={false} style={{ ...s.row, ...rule(PAPER.ink), paddingVertical: 3 }}>
            <Text style={{ width: cols.date }}>{formatDateFr(r.payment.paid_on)}</Text>
            <Text style={{ width: cols.client, paddingRight: 6 }}>{up(r.clientName)}</Text>
            <Text style={{ width: cols.invoice }}>{r.invoiceNumber}</Text>
            <Text style={{ width: cols.method }}>{up(METHOD_LABELS[r.payment.method])}</Text>
            <Text style={{ width: cols.amount, textAlign: 'right' }}>{money(r.payment.amount_cents)}</Text>
          </View>
        ))}
        {d.rows.length === 0 && <Text style={{ marginTop: 10 }}>AUCUN ENCAISSEMENT EN {d.year}.</Text>}
        <View style={{ ...s.row, marginTop: 8, paddingVertical: 4 }} wrap={false}>
          <Text style={{ flex: 1, ...s.bold }}>TOTAL DES RECETTES {d.year}</Text>
          <Text style={s.bold}>{money(bookTotalCents(d.rows))}</Text>
        </View>
      </View>
      <Text fixed style={{ position: 'absolute', bottom: 20, left: 32 }} render={({ pageNumber, totalPages }) => `PAGE ${pageNumber} / ${totalPages}`} />
    </Page>
  )
}

export async function renderBookPdf(d: BookPdfData): Promise<Blob> {
  return pdf(
    <Document title={`Livre des recettes ${d.year}`} author={d.company.legalName}>
      <BookPage d={d} />
    </Document>,
  ).toBlob()
}
