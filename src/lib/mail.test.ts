import { describe, expect, it } from 'vitest'
import { configProblems, defaultMailConfig, mailSchema, newMailItems, rowFromMail, splitList, type MailItem } from './mail'

const mail = (uid: number, over: Partial<MailItem> = {}): MailItem => ({
  uid, message_id: `<m${uid}@x>`, from: 'SeDomicilier <no-reply@sedomicilier.fr>', subject: `Courrier ${uid}`, date: '2026-10-0' + uid,
  snippet: 'Vous avez reçu un courrier', attachments: ['scan.pdf'], matched: true, ...over,
})

describe('réglages du courrier', () => {
  it('accepte une configuration correcte', () => {
    expect(configProblems({ ...defaultMailConfig(), user: 'noe@gmail.com', senders: ['urssaf'] })).toEqual([])
  })

  it('ne suppose aucun service de courrier par défaut : il faut choisir qui reconnaître', () => {
    expect(defaultMailConfig().senders).toEqual([])
    expect(configProblems({ ...defaultMailConfig(), user: 'noe@gmail.com' })).toHaveLength(1)
  })

  it('signale ce qui manque, et refuse une connexion non chiffrée', () => {
    const c = { ...defaultMailConfig(), user: 'pas-une-adresse', host: 'a b', port: 143, folder: ' ', senders: [], subjects: [] }
    expect(configProblems(c)).toHaveLength(5)
    expect(configProblems({ ...defaultMailConfig(), user: 'a@b.fr', senders: [], subjects: ['courrier'] })).toEqual([])
  })

  it('découpe une liste de mots sans doublons', () => {
    expect(splitList('sedomicilier, SeDomicilier ;courrier\n  scan ,,')).toEqual(['sedomicilier', 'SeDomicilier', 'courrier', 'scan'])
    expect(splitList('')).toEqual([])
  })
})

describe('classement dans la base Courrier', () => {
  it("ne garde que les messages reconnus et jamais déjà classés, du plus ancien au plus récent", () => {
    const items = [mail(3), mail(1), mail(2, { matched: false }), mail(4), mail(3)]
    const fresh = newMailItems(items, new Set(['<m4@x>']))
    expect(fresh.map((m) => m.uid)).toEqual([1, 3])
  })

  it('une deuxième relève ne crée aucun doublon', () => {
    const items = [mail(1), mail(2)]
    const first = newMailItems(items, new Set())
    const known = new Set(first.map((m) => m.message_id))
    expect(newMailItems(items, known)).toEqual([])
  })

  it("prépare la ligne : titre, date, statut « à traiter » et identifiant du message", () => {
    const row = rowFromMail(mail(2, { attachments: ['a.pdf', 'b.pdf'], subject: '  ' }))
    expect(row.title).toBe('(sans objet)')
    expect(row.values).toMatchObject({ date: '2026-10-02', statut: 'atraiter', pj: 'a.pdf, b.pdf', mid: '<m2@x>' })
  })

  it('crée une base « Courrier » avec une vue des courriers à traiter', () => {
    const schema = mailSchema()
    expect(schema.kind).toBe('mail')
    expect(schema.columns.map((c) => c.name)).toEqual(['Date', 'Expéditeur', 'Statut', 'Pièces jointes', 'Aperçu'])
    expect(schema.views[0].filters[0]).toMatchObject({ colId: 'statut', op: 'is', value: 'atraiter' })
  })
})
