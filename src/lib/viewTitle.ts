// Le nom d'un écran qui n'est pas une page (Accueil, Devis, Tout…), pour l'afficher dans la barre d'onglets : l'onglet actif dit toujours où l'on est.

const TITLES: Record<string, string> = {
  home: 'Accueil',
  trash: 'Corbeille',
  settings: 'Réglages',
  clients: 'Clients',
  services: 'Tarifs',
  quotes: 'Devis',
  invoices: 'Factures',
  payments: 'Paiements',
  dashboard: 'Tableau de bord',
}

const LIBRARY_TITLES: Record<string, string> = { all: 'Tout', collections: 'Collections', moodboards: 'Moodboards', map: 'Carte' }

/** `collection` : le nom du tableau ouvert dans « Tout », s'il y en a un. */
export function viewTitle(view: string, libPage = 'all', collection: string | null = null): string {
  if (view === 'library') return (libPage === 'all' && collection) || LIBRARY_TITLES[libPage] || 'Bibliothèque'
  return TITLES[view] ?? 'Form'
}
