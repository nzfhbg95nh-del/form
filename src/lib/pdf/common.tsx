import { Font, Image, StyleSheet, Text, View } from '@react-pdf/renderer'
import regularUrl from '@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-Regular.woff?url'
import boldUrl from '@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-SemiBold.woff?url'
import { clientAddressLines, clientDisplayName, formatEuros } from '../business'
import { formatQuantity, lineTotalCents } from '../quotes'
import type { Client } from '../types'
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

export interface Palette {
  bg: string
  ink: string
}

export const PINK: Palette = { bg: '#FAD7DC', ink: '#5E2B33' }
export const PAPER: Palette = { bg: '#FAFAF8', ink: '#3F3F3F' }
export const BLUE: Palette = { bg: '#D9EAF6', ink: '#2F4F66' }
export const SAND: Palette = { bg: '#FBF3D0', ink: '#5E5222' }

export const up = (s: string) => s.toLocaleUpperCase('fr-FR')

// Les espaces insécables des montants n'existent pas dans la police : on les remplace par des espaces simples.
export const money = (cents: number) => formatEuros(cents).replace(/[  ]/g, ' ')

/** « 2,5 jours », « 1 jour » : on met au pluriel quand la quantité dépasse 1. */
export function pluralUnit(unit: string, milli: number): string {
  return milli > 1000 && !unit.endsWith('s') ? `${unit}s` : unit
}

export function styles(ink: string) {
  return StyleSheet.create({
    page: { padding: 32, fontFamily: 'Plex', fontSize: 7.5, lineHeight: 1.55, color: ink },
    row: { flexDirection: 'row' },
    bold: { fontWeight: 700 },
    box: { borderWidth: 0.7, borderColor: ink, flexDirection: 'row', padding: 8, minHeight: 88 },
  })
}

export const rule = (ink: string) => ({ borderBottomWidth: 0.5, borderBottomColor: ink })

/** En-tête : nom (ou logo) à gauche, champs « LIBELLÉ : valeur » alignés comme sur les modèles de Victor. */
export function Header({ p, company, logo, fields }: { p: Palette; company: Pick<Company, 'tradeName'>; logo: string | null; fields: [string, string][] }) {
  const s = styles(p.ink)
  return (
    <View style={{ position: 'relative' }}>
      <View style={{ position: 'absolute', left: 0, top: 0, width: 120 }}>
        {logo ? <Image src={logo} style={{ height: 30, objectFit: 'contain', objectPosition: 'left' }} /> : <Text>{up(company.tradeName)}</Text>}
      </View>
      <View>
        {fields.map(([label, value], i) => (
          <View key={label} style={s.row}>
            <Text style={{ width: 251, textAlign: 'right', paddingRight: 8 }}>{up(label)} :</Text>
            <Text style={{ width: 251, marginLeft: 31, ...rule(p.ink), ...(i === 0 ? { borderTopWidth: 0.5, borderTopColor: p.ink } : {}) }}>{up(value)}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export function emitterLines(company: Omit<Company, 'logo'>): string[] {
  return [
    company.legalName, company.statusMention, company.street, `${company.postalCode} ${company.city}`.trim(), company.country,
    company.phone, company.email, `SIRET : ${company.siret || "en cours d'obtention"}`,
  ].filter((x) => x && x.trim())
}

export function clientLinesOf(client: Client): string[] {
  return [
    clientDisplayName(client), ...(client.company_name && client.name ? [client.name] : []), ...clientAddressLines(client),
    ...(client.siret ? [`SIRET : ${client.siret}`] : client.siren ? [`SIREN : ${client.siren}`] : []),
    ...(client.vat_number ? [`TVA : ${client.vat_number}`] : []),
  ]
}

export function PartyBoxes({ p, company, client }: { p: Palette; company: Omit<Company, 'logo'>; client: Client }) {
  const s = styles(p.ink)
  const side = (label: string, lines: string[], extra?: object) => (
    <View style={{ ...s.box, width: 251, ...extra }}>
      <Text style={{ width: 66, borderRightWidth: 0.5, borderRightColor: p.ink }}>{label}</Text>
      <View style={{ paddingLeft: 10, flex: 1 }}>{lines.map((t, i) => <Text key={i}>{up(t)}</Text>)}</View>
    </View>
  )
  return (
    <View style={{ ...s.row, marginTop: 22 }}>
      {side('ÉMETTEUR :', emitterLines(company))}
      {side('CLIENT :', clientLinesOf(client), { marginLeft: 31 })}
    </View>
  )
}

export interface PdfLine {
  id: string
  label: string
  description: string
  quantity_milli: number
  unit: string
  unit_price_cents: number
}

export function ItemsTable({ p, lines }: { p: Palette; lines: PdfLine[] }) {
  const s = styles(p.ink)
  const line = rule(p.ink)
  return (
    <>
      <View style={{ marginTop: 18, borderTopWidth: 0.5, borderTopColor: p.ink, ...line, paddingVertical: 2 }}>
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
    </>
  )
}

export function TotalRow({ p, label, cents, bold, text }: { p: Palette; label: string; cents?: number; bold?: boolean; text?: string }) {
  const s = styles(p.ink)
  return (
    <View style={{ ...s.row, ...rule(p.ink), paddingVertical: bold ? 4 : 2 }}>
      <Text style={{ flex: 1, ...(bold ? s.bold : {}) }}>{up(label)}</Text>
      {cents !== undefined && <Text style={bold ? s.bold : undefined}>{money(cents)}</Text>}
      {text !== undefined && <Text>{text}</Text>}
    </View>
  )
}
