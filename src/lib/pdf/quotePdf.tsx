import { Document, Page, pdf, Text, View } from '@react-pdf/renderer'
import { formatDateFr, depositCents, quoteTotalCents } from '../quotes'
import type { Client, Quote, QuoteLine } from '../types'
import type { Company } from '../company'
import { Header, ItemsTable, PAPER, PartyBoxes, PINK, rule, styles, TotalRow, up } from './common'

export interface QuotePdfData {
  quote: Quote
  lines: QuoteLine[]
  company: Omit<Company, 'logo'>
  logo: string | null
  client: Client
  vatMention: string
  /** Vrai tant que le devis n'a pas de numéro. */
  isDraft: boolean
}

function QuotePage({ d }: { d: QuotePdfData }) {
  const s = styles(PINK.ink)
  const { quote, lines, company, client } = d
  const total = quoteTotalCents(lines)
  const deposit = depositCents(total, quote.deposit_percent)
  const fields: [string, string][] = [
    ['Date', formatDateFr(quote.issue_date)],
    ['Numéro de devis', quote.number ?? 'BROUILLON (NON NUMÉROTÉ)'],
    ["Valable jusqu'au", `${formatDateFr(quote.valid_until)} (${company.quoteValidityDays} jours)`],
  ]

  return (
    <Page size="A4" style={{ ...s.page, backgroundColor: PINK.bg }}>
      <Header p={PINK} company={company} logo={d.logo} fields={fields} />
      <PartyBoxes p={PINK} company={company} client={client} />

      {quote.title.trim() !== '' && <Text style={{ marginTop: 14, ...s.bold }}>OBJET : {up(quote.title)}</Text>}

      <ItemsTable p={PINK} lines={lines} />

      <View wrap={false} style={{ marginTop: 10 }}>
        <TotalRow p={PINK} label="Sous-total HT" cents={total} />
        <View style={{ ...rule(PINK.ink), paddingVertical: 2 }}><Text>{up(d.vatMention)}</Text></View>
        <TotalRow p={PINK} label="Total :" cents={total} bold />
      </View>

      {quote.deposit_percent > 0 && (
        <View wrap={false} style={{ marginTop: 22 }}>
          <Text style={{ width: 281 }}>
            UN ACOMPTE DE {quote.deposit_percent}% DU MONTANT TOTAL SERA DEMANDÉ À LA SIGNATURE DU DEVIS. LE SOLDE SERA À RÉGLER SUR UNE FACTURE DÉDIÉE SPÉCIALEMENT À L’ACOMPTE.
          </Text>
          <View style={{ marginTop: 18 }}>
            <TotalRow p={PINK} label="Total acompte :" cents={deposit} bold />
          </View>
        </View>
      )}

      <View wrap={false} style={{ marginTop: 22, width: 281 }}>
        {quote.included_revisions !== null && <Text>RETOUCHES INCLUSES : {quote.included_revisions}</Text>}
        {quote.notes.trim() !== '' && <Text style={{ marginBottom: 6 }}>{up(quote.notes)}</Text>}
        <Text>LE PAIEMENT EST À EFFECTUER DANS LES {quote.payment_days} JOURS SUR LE COMPTE :</Text>
        <Text>IBAN {up(company.iban || 'XXXX XXXX XXXX XXXX XXXX X')}{company.bic ? `   BIC ${up(company.bic)}` : ''}</Text>
        <Text style={{ marginTop: 14 }}>
          <Text style={s.bold}>LES CONDITIONS GÉNÉRALES DE VENTE</Text> SONT FOURNIES DANS LE DOCUMENT JOINT AU PRÉSENT DEVIS. EN LE SIGNANT, LE CLIENT RECONNAÎT AVOIR PRIS CONNAISSANCE DES CONDITIONS GÉNÉRALES DE VENTE ET LES ACCEPTE SANS RÉSERVE.
        </Text>
      </View>

      <View wrap={false} style={{ marginTop: 28, width: 251, borderWidth: 0.7, borderColor: PINK.ink, padding: 8, height: 120 }}>
        <Text>SIGNATURE DU CLIENT</Text>
        <Text>AVEC LA MENTION “BON POUR ACCORD ET EXÉCUTION DES TRAVAUX” :</Text>
      </View>
    </Page>
  )
}

/** Les CGV : « ARTICLE n - TITRE », puis des lignes à puces (« * ») et sous-puces (« - »). */
function CgvPages({ company, cgvDate }: { company: Omit<Company, 'logo'>; cgvDate: string }) {
  const s = styles(PAPER.ink)
  const blocks: { kind: 'article' | 'bullet' | 'sub'; text: string }[] = []
  for (const raw of company.cgv.split('\n')) {
    const t = raw.trim()
    if (!t) continue
    if (/^ARTICLE\s+\d+/i.test(t)) blocks.push({ kind: 'article', text: t })
    else if (t.startsWith('* ')) blocks.push({ kind: 'bullet', text: t.slice(2) })
    else if (t.startsWith('- ')) blocks.push({ kind: 'sub', text: t.slice(2) })
    else blocks.push({ kind: 'bullet', text: t })
  }
  const fields: [string, string][] = [
    ['Document', 'Conditions générales de vente'],
    ['Date de mise à jour', formatDateFr(cgvDate)],
    ['Émetteur', company.legalName],
  ]

  return (
    <Page size="A4" style={{ ...s.page, backgroundColor: PAPER.bg }}>
      <View fixed>
        <Header p={PAPER} company={company} logo={null} fields={fields} />
      </View>
      <View style={{ marginTop: 34 }}>
        {blocks.map((b, i) =>
          b.kind === 'article' ? (
            <View key={i} wrap={false} minPresenceAhead={40} style={{ marginTop: i === 0 ? 0 : 12, borderTopWidth: 0.5, borderTopColor: PAPER.ink, paddingTop: 4, marginBottom: 6 }}>
              <Text style={s.bold}>{up(b.text)}</Text>
            </View>
          ) : (
            <View key={i} style={{ ...s.row, marginBottom: 3 }}>
              <Text style={{ width: 16 }}>{b.kind === 'sub' ? '-' : '*'}</Text>
              <Text style={{ flex: 1, textAlign: 'justify' }}>{up(b.text)}</Text>
            </View>
          ),
        )}
      </View>
    </Page>
  )
}

export function QuoteDocument({ d }: { d: QuotePdfData }) {
  return (
    <Document title={d.quote.number ?? 'Devis (brouillon)'} author={d.company.legalName}>
      <QuotePage d={d} />
      <CgvPages company={d.company} cgvDate={d.company.cgvDate} />
    </Document>
  )
}

export async function renderQuotePdf(d: QuotePdfData): Promise<Blob> {
  return pdf(<QuoteDocument d={d} />).toBlob()
}
