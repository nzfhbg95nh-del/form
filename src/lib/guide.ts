import { cleanSiret, missingForIssuing, type Company } from './company'
import type { Invoice, Payment, Quote } from './types'
import type { View } from '@/store/app'

export interface GuideStep {
  id: string
  title: string
  help: string
  done: boolean
  /** Où aller pour faire cette étape. */
  view: View
  /** Texte du bouton. */
  action: string
}

interface GuideInput {
  company: Company
  clientCount: number
  quotes: Pick<Quote, 'status'>[]
  invoices: Pick<Invoice, 'kind' | 'status'>[]
  payments: Pick<Payment, 'id'>[]
}

/** Les étapes du premier client, cochées d'après ce qui existe déjà dans l'application. */
export function guideSteps({ company, clientCount, quotes, invoices, payments }: GuideInput): GuideStep[] {
  const issued = (kind: string) => invoices.some((i) => i.kind === kind && i.status !== 'draft')
  return [
    {
      id: 'company', title: 'Remplir ton entreprise', done: missingForIssuing(company, { needSiret: false }).length === 0,
      help: 'Nom légal, mention « Entrepreneur individuel », adresse et IBAN : ils apparaissent sur tes devis et factures.', view: 'settings', action: 'Ouvrir les réglages',
    },
    {
      id: 'client', title: 'Créer le client', done: clientCount > 0,
      help: 'Nom, adresse, e-mail. Pour une entreprise, ajoute son SIRET (obligatoire sur ses factures).', view: 'clients', action: 'Aller aux clients',
    },
    {
      id: 'quote', title: 'Créer un devis', done: quotes.length > 0,
      help: 'Choisis le client, ajoute les lignes depuis tes tarifs, règle l’acompte et la date de validité.', view: 'quotes', action: 'Aller aux devis',
    },
    {
      id: 'sent', title: 'Envoyer le devis', done: quotes.some((q) => q.status !== 'draft'),
      help: 'Enregistre le PDF, envoie-le toi-même au client, puis marque le devis « envoyé » : il est alors verrouillé.', view: 'quotes', action: 'Aller aux devis',
    },
    {
      id: 'accepted', title: 'Le client accepte', done: quotes.some((q) => q.status === 'accepted'),
      help: 'Quand il répond oui, passe le devis en « accepté ».', view: 'quotes', action: 'Aller aux devis',
    },
    {
      id: 'siret', title: 'Renseigner ton SIRET', done: cleanSiret(company.siret).length === 14,
      help: 'Il est obligatoire pour émettre une facture. Tant que tu ne l’as pas, les étapes suivantes restent bloquées.', view: 'settings', action: 'Ouvrir les réglages',
    },
    {
      id: 'deposit', title: 'Émettre la facture d’acompte', done: issued('deposit'),
      help: 'Depuis le devis : l’acompte prévu. Envoie-la au client.', view: 'invoices', action: 'Aller aux factures',
    },
    {
      id: 'final', title: 'Émettre la facture de solde', done: issued('final'),
      help: 'Quand le travail est fait. Elle déduit l’acompte déjà facturé.', view: 'invoices', action: 'Aller aux factures',
    },
    {
      id: 'payment', title: 'Enregistrer le paiement', done: payments.length > 0,
      help: 'Date et montant reçus : le tableau de bord suit ce qui est encaissé et ce qui reste dû.', view: 'payments', action: 'Aller aux paiements',
    },
  ]
}

/** La première étape pas encore faite. */
export const nextStep = (steps: GuideStep[]) => steps.find((s) => !s.done)
