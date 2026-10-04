import { Document, Font, Image, Page, pdf, StyleSheet, Text, View } from '@react-pdf/renderer'
import regularUrl from '@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-Regular.woff?url'
import boldUrl from '@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-SemiBold.woff?url'
import { clientAddressLines, clientDisplayName, formatEuros } from '../business'
import { formatDateFr, formatQuantity, depositCents, lineTotalCents, quoteTotalCents } from '../quotes'
import type { Client, Quote, QuoteLine } from '../types'
import type { Company } from '../company'

Font.register({
  family: 'Plex',
  fonts: [
    { src: regularUrl, fontWeight: 400 },
    { src: boldUrl, fontWeight: 700 },
  ],
})
// Pas de coupure de mots au milieu : on laisse le texte aller à la ligne aux espaces.
Font.registerHyphenationCallback((word) => [word])

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

const PINK = { bg: '#FAD7DC', ink: '#5E2B33' }
const PAPER = { bg: '#FAFAF8', ink: '#3F3F3F' }
/** « 2,5 jours », « 1 jour » : on met au pluriel quand la quantité dépasse 1. */
function pluralUnit(unit: string, milli: number): string {
  return milli > 1000 && !unit.endsWith('s') ? `${unit}s` : unit
}
const up = (s: string) => s.toLocaleUpperCase('fr-FR')
// Les espaces insécables des montants n'existent pas dans la police : on les remplace par des espaces simples.
const money = (cents: number) => formatEuros(cents).replace(/[  ]/g, ' ')

function styles(ink: string) {
  return StyleSheet.create({
    page: { padding: 32, fontFamily: 'Plex', fontSize: 7.5, lineHeight: 1.55, color: ink },
    row: { flexDirection: 'row' },
    hairBottom: { borderBottomWidth: 0.5, borderBottomColor: ink },
    bold: { fontWeight: 700 },
    box: { borderWidth: 0.7, borderColor: ink, flexDirection: 'row', padding: 8, minHeight: 88 },
  })
}

function QuotePage({ d }: { d: QuotePdfData }) {
  const s = styles(PINK.ink)
  const { quote, lines, company, client } = d
  const total = quoteTotalCents(lines)
  const deposit = depositCents(total, quote.deposit_percent)
  const line = { borderBottomWidth: 0.5, borderBottomColor: PINK.ink }
  const fields: [string, string][] = [
    ['Date', formatDateFr(quote.issue_date)],
    ['Numéro de devis', quote.number ?? 'BROUILLON (NON NUMÉROTÉ)'],
    ["Valable jusqu'au", `${formatDateFr(quote.valid_until)} (${company.quoteValidityDays} jours)`],
  ]
  const emitter = [
    company.legalName, company.statusMention, company.street, `${company.postalCode} ${company.city}`.trim(), company.country,
    company.phone, company.email, `SIRET : ${company.siret || 'XXXXXXXXXXXXXX'}`,
  ].filter((x) => x && x.trim())
  const clientLines = [
    clientDisplayName(client), ...(client.company_name && client.name ? [client.name] : []), ...clientAddressLines(client),
    ...(client.siret ? [`SIRET : ${client.siret}`] : client.siren ? [`SIREN : ${client.siren}`] : []),
    ...(client.vat_number ? [`TVA : ${client.vat_number}`] : []),
  ]

  return (
    <Page size="A4" style={{ ...s.page, backgroundColor: PINK.bg }}>
      <View style={{ position: 'relative' }}>
        <View style={{ position: 'absolute', left: 0, top: 0, width: 120 }}>
          {d.logo ? <Image src={d.logo} style={{ height: 30, objectFit: 'contain', objectPosition: 'left' }} /> : <Text>{up(company.tradeName)}</Text>}
        </View>
        <View>
          {fields.map(([label, value], i) => (
            <View key={label} style={s.row}>
              <Text style={{ width: 251, textAlign: 'right', paddingRight: 8 }}>{up(label)} :</Text>
              <Text style={{ width: 251, marginLeft: 31, ...line, ...(i === 0 ? { borderTopWidth: 0.5, borderTopColor: PINK.ink } : {}) }}>{up(value)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ ...s.row, marginTop: 22 }}>
        <View style={{ ...s.box, width: 251 }}>
          <Text style={{ width: 66, borderRightWidth: 0.5, borderRightColor: PINK.ink }}>ÉMETTEUR :</Text>
          <View style={{ paddingLeft: 10, flex: 1 }}>{emitter.map((t, i) => <Text key={i}>{up(t)}</Text>)}</View>
        </View>
        <View style={{ ...s.box, width: 251, marginLeft: 31 }}>
          <Text style={{ width: 66, borderRightWidth: 0.5, borderRightColor: PINK.ink }}>CLIENT :</Text>
          <View style={{ paddingLeft: 10, flex: 1 }}>{clientLines.map((t, i) => <Text key={i}>{up(t)}</Text>)}</View>
        </View>
      </View>

      {quote.title.trim() !== '' && <Text style={{ marginTop: 14, ...s.bold }}>OBJET : {up(quote.title)}</Text>}

      <View style={{ marginTop: 18, borderTopWidth: 0.5, borderTopColor: PINK.ink, ...line, paddingVertical: 2 }}>
        <View style={s.row}>
          <Text style={{ width: 282 }}>DÉSIGNATION{'\n'}& DÉTAILS</Text>
          <Text style={{ width: 181 }}>QUANTITÉ</Text>
          <Text style={{ width: 70, textAlign: 'right' }}>TOTAL{'\n'}HT</Text>
        </View>
      </View>

      {lines.map((l) => (
        <View key={l.id} wrap={false} style={{ ...s.row, ...line, paddingVertical: 6 }}>
          <View style={{ width: 282, paddingRight: 12 }}>
            <Text>{up(l.label)}</Text>
            {l.description.trim() !== '' && <Text>{up(l.description)}</Text>}
          </View>
          <Text style={{ width: 181 }}>{formatQuantity(l.quantity_milli)} {up(pluralUnit(l.unit, l.quantity_milli))}</Text>
          <Text style={{ width: 70, textAlign: 'right' }}>{money(lineTotalCents(l))}</Text>
        </View>
      ))}

      <View wrap={false} style={{ marginTop: 10 }}>
        <View style={{ ...s.row, ...line, paddingVertical: 2 }}>
          <Text style={{ flex: 1 }}>SOUS-TOTAL HT</Text>
          <Text>{money(total)}</Text>
        </View>
        <View style={{ ...line, paddingVertical: 2 }}>
          <Text>{up(d.vatMention)}</Text>
        </View>
        <View style={{ ...s.row, ...line, paddingVertical: 4 }}>
          <Text style={{ flex: 1, ...s.bold }}>TOTAL :</Text>
          <Text style={s.bold}>{money(total)}</Text>
        </View>
      </View>

      {quote.deposit_percent > 0 && (
        <View wrap={false} style={{ marginTop: 22 }}>
          <Text style={{ width: 281 }}>
            UN ACOMPTE DE {quote.deposit_percent}% DU MONTANT TOTAL SERA DEMANDÉ À LA SIGNATURE DU DEVIS. LE SOLDE SERA À RÉGLER SUR UNE FACTURE DÉDIÉE SPÉCIALEMENT À L’ACOMPTE.
          </Text>
          <View style={{ ...s.row, ...line, paddingVertical: 4, marginTop: 18 }}>
            <Text style={{ flex: 1, ...s.bold }}>TOTAL ACOMPTE :</Text>
            <Text style={s.bold}>{money(deposit)}</Text>
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
  const hair = { borderBottomWidth: 0.5, borderBottomColor: PAPER.ink }
  const fields: [string, string][] = [
    ['Document', 'Conditions générales de vente'],
    ['Date de mise à jour', formatDateFr(cgvDate)],
    ['Émetteur', company.legalName],
  ]

  return (
    <Page size="A4" style={{ ...s.page, backgroundColor: PAPER.bg }}>
      <View style={{ position: 'relative' }} fixed>
        <Text style={{ position: 'absolute', left: 0, top: 0 }}>{up(company.tradeName)}</Text>
        <View>
          {fields.map(([label, value], i) => (
            <View key={label} style={s.row}>
              <Text style={{ width: 251, textAlign: 'right', paddingRight: 8 }}>{up(label)} :</Text>
              <Text style={{ width: 251, marginLeft: 31, ...hair, ...(i === 0 ? { borderTopWidth: 0.5, borderTopColor: PAPER.ink } : {}) }}>{up(value)}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ marginTop: 34 }}>
        {blocks.map((b, i) =>
          b.kind === 'article' ? (
            <View key={i} wrap={false} minPresenceAhead={40} style={{ marginTop: i === 0 ? 0 : 12, borderTopWidth: 0.5, borderTopColor: PAPER.ink, paddingTop: 4, marginBottom: 6 }}>
              <Text style={s.bold}>{up(b.text)}</Text>
            </View>
          ) : (
            <View key={i} style={{ ...s.row, marginBottom: 3, paddingLeft: b.kind === 'sub' ? 0 : 0 }}>
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
