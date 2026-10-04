# Journal de Form

## 2026-10-03 — Phase 0 (Fondations), première version

**Fait**
- Dépôt GitHub privé relié, projet nommé « Form ».
- Squelette Tauri 2 + React + TypeScript + Tailwind 4 (composants dans le style shadcn/ui, écrits à la main).
- Base SQLite locale (`form.db`) avec migrations versionnées (`src-tauri/migrations/`) : tables `objects` et `settings`.
- Barre latérale (pages, favoris, corbeille, réglages), thème clair / sombre, création de pages, enregistrement automatique.
- Sauvegarde quotidienne automatique vers un dossier choisi + « Sauvegarder maintenant » + « Exporter tout » (copie de la base).
- GitHub Actions : une étiquette `v*` fabrique le .msi et le publie dans Releases.
- Tests automatiques sur la logique de sauvegarde.

**À savoir**
- Le contenu d'une page est pour l'instant un simple champ texte (`content = {"text": ...}`). Il sera remplacé par BlockNote en phase 1 (migration prévue).
- La partie Windows (Rust) n'a pas pu être compilée sur le PC de Victor (Rust non installé, volontairement) : le premier vrai test est le .msi fabriqué par GitHub.

**Reste pour finir la phase 0**
- Victor installe le .msi, crée une page, redémarre l'app et vérifie qu'elle est toujours là.
- Victor choisit un dossier de sauvegarde et teste « Sauvegarder maintenant ».

## 2026-10-03 — Phase 0 validée
- Victor a installé le .msi v0.1.0 : pages, redémarrage, sauvegarde, thème, corbeille et favoris fonctionnent.
- Prochaine étape : phase 1 (le Notion), en attente du plan validé.

## 2026-10-03 — Phase 1, étape 1 : éditeur de blocs (v0.2.0)
- BlockNote en français : menu /, titres, listes, cases à cocher, citations, séparateurs, code, toggles, images (enregistrées dans la base), callouts, colonnes.
- Anciennes pages (champ texte de la phase 0) converties automatiquement.
- Colonnes : paquet @blocknote/xl-multi-column sous licence GPL-3 (usage perso, non distribué : OK).
- Reste : étapes 2 à 6 de la phase 1.

## 2026-10-03 — Phase 1, étape 2 : pages imbriquées (v0.3.0)
- Sous-pages (bouton + au survol d'une page), flèche pour déplier / replier (état mémorisé).
- Glisser-déposer dans la barre latérale : bord haut = avant, bord bas = après, milieu = dedans. Impossible de déplacer une page dans elle-même.
- Icône (emoji) et couverture (dégradés, couleurs ou image importée) ; chemin de la page (fil d'Ariane).
- Corbeille : une page emporte ses sous-pages et les ramène à la restauration.
- Fenêtre : dragDropEnabled=false pour que le glisser-déposer HTML fonctionne dans Windows.
- Incident : un BOM ajouté par un script avait cassé la fabrication de v0.2.0 (corrigé en v0.2.1).

## 2026-10-04 — Phase 1, étape 3a : bases de données, vue tableau (v0.4.0)
- « Nouvelle base de données » : propriétés typées (texte, nombre, date, choix unique, choix multiple, case à cocher, lien). Relation et fichier : étape 3b.
- Vue tableau éditable, nouvelle ligne, ouverture d'une ligne comme page (propriétés + blocs), corbeille des lignes.
- Filtres (cumulés) et tris par propriété, enregistrés dans la base. Logique testée (src/lib/database.test.ts).
- Choix technique : le schéma et les vues sont dans `objects.properties` de la base (pas de tables `databases`/`views` séparées) ; plus simple, pas de migration. Tableau maison, sans TanStack Table.
- Reste (3b) : vues liste / kanban / calendrier / galerie, groupements, relations, fichiers.

## 2026-10-04 — Phase 1, étape 3b : vues, groupements, relations, fichiers (v0.5.0)
- Plusieurs vues par base (onglets) : tableau, liste, kanban (glisser les cartes entre colonnes), calendrier (mois, + sur un jour), galerie. Chaque vue garde ses filtres, tris et réglages.
- Regroupement (tableau, liste) par choix unique / multiple / case à cocher.
- Propriété « Relation » (lien vers les lignes d'une autre base, y compris la même) et « Fichiers » (enregistrés dans la base, 10 Mo max chacun).
- Tests : groupements et grille du calendrier.
- Reste de la phase 1 : étape 4 (tâches + rappels + modèles de pages), 5 (Ctrl+K, capture rapide), 6 (import Notion).

## 2026-10-04 — Phase 1, étape 4 : tâches, rappels, modèles de pages (v0.6.0)
- Menu « Nouveau… » dans la barre latérale : page vide, note rapide, recette, projet, base de données vide, base de tâches.
- Base de tâches prête à l'emploi : Statut (À faire / En cours / Fait), Échéance, Priorité ; vues « À faire » (triée par échéance, sans les tâches faites), Kanban, Calendrier.
- Rappels : notification Windows (plugin Tauri notification) pour les tâches dont l'échéance est aujourd'hui ou dépassée. Vérification au démarrage, toutes les 30 min et au retour de la fenêtre ; une tâche n'est rappelée qu'une fois par jour ; interrupteur + bouton de test dans Réglages. Fonctionne seulement app ouverte.
- Tests : recherche des tâches à rappeler, anti-doublon, texte de la notification.
- Reste de la phase 1 : étape 5 (Ctrl+K, capture rapide par raccourci global), étape 6 (import Notion).

## 2026-10-04 — Phase 1, étape 5 : recherche Ctrl+K et capture rapide (v0.7.0)
- Recherche globale (Ctrl+K ou bouton « Rechercher ») : titres et contenu des pages, lignes de bases, sans tenir compte des accents ni des majuscules ; flèches + Entrée ; pages récentes quand la recherche est vide. La page ouverte est dépliée dans la barre latérale.
- Capture rapide : Ctrl+Alt+N, raccourci GLOBAL (plugin Tauri global-shortcut) qui ramène Form au premier plan et ouvre une fenêtre de saisie ; aussi bouton « Capture rapide ». Les captures vont dans la page « Boîte de réception » (créée automatiquement), 1re ligne = titre.
- Limite : le raccourci global ne marche que si Form est lancé. Si un autre programme utilise déjà Ctrl+Alt+N, Form démarre sans le raccourci.
- Tests : recherche (accents, contenu, chemin, récents) et découpage des captures.
- Reste de la phase 1 : étape 6 (import Notion).

## 2026-10-04 — Finitions « façon Notion » (v0.8.0)
- Menu « ⋯ » (et clic droit) sur chaque page de la barre latérale : favori, renommer (sur place), dupliquer (avec sous-pages et lignes), déplacer vers…, corbeille, nouvel onglet, aperçu latéral, date de dernière modification.
- Section « Récentes » (5 dernières pages modifiées).
- Onglets : Ctrl+clic ou clic molette sur une page, bouton + (ou Ctrl+T) ; × pour fermer.
- Aperçu latéral : Alt+clic sur une page, ou ↗ d'une ligne de tableau ; bouton « Ouvrir en pleine page ».
- Raccourcis : Ctrl+D dupliquer, Ctrl+Maj+R renommer, Ctrl+T nouvel onglet.
- Volontairement PAS fait : « Copier le lien » (il faut d'abord des liens internes entre pages), « Nouvelle fenêtre » (deux fenêtres qui modifient la même page risquent de s'écraser), « Disponible hors ligne » et « Convertir en wiki » (inutiles : tout est local, un seul utilisateur).
- Tests : onglets (tabs.test.ts), ordre de duplication.
- Reste : import Notion (reporté à la demande de Victor). Phase 1 « finie » quand Victor l'utilise une semaine.

## 2026-10-04 — Phase 2, étape 1 : réglages de l'entreprise et CGV (v0.9.0)
- Réglages > Entreprise : nom légal, nom commercial, mention EI, SIRET, adresse (provisoire : Tournai), contacts, IBAN, logo, conditions par défaut (30 j de paiement, devis 30 j, acompte 30 %, pénalités, 40 € de recouvrement, escompte), mention de TVA automatique selon la date (293 B du CGI jusqu'au 31/12/2026, L. 233-1 du CIBS ensuite) modifiable, mention clients hors France avec avertissement « à valider par un comptable ».
- Réglages > CGV : texte des CGV de Victor (version 20/11/2025), modifiable, qui sera joint aux devis.
- Garde-fou : `missingForIssuing` listera ce qui manque (SIRET, nom, mention EI, adresse) ; l'émission d'une vraie facture sera refusée tant que ce n'est pas rempli (brouillons et tests restent possibles). Victor n'a pas encore de SIRET.
- Décisions de Victor : numérotation continue sans trou (F-2026-001, D-2026-001, A-2026-001) ; adresse à modifier plus tard ; nom légal sur les documents ; police des PDF : IBM Plex Mono ; tribunal de Tournai (CGV art. 8) laissé tel quel pour le moment.
- Modèles de Victor (devis rose, facture bleue, acompte blanc) : à reproduire en PDF aux étapes 3 et 4, avec TVA remplacée par la mention de franchise, « date d'échéance » + « date de la prestation », pénalités / 40 € / escompte en bas des factures, sans bloc de signature sur les factures.
- Tests : mention de TVA, SIRET (clé de contrôle), champs obligatoires, CGV.
- Prochaine étape : 2 (clients et catalogue de prestations).

## 2026-10-04 — Phase 2, étape 2 : clients et prestations (v0.10.0)
- Nouvelle section « Mon entreprise » dans la barre latérale : Clients, Prestations.
- Clients : professionnel / particulier, raison sociale, nom, SIREN (déduit du SIRET), SIRET, n° de TVA intracommunautaire, adresse, pays, e-mail, téléphone, contact, notes. Contrôle des clés SIREN/SIRET, avertissement pour clients hors France et rappel du SIREN obligatoire en 2027. Archivage au lieu de suppression (un client archivé reste sur ses documents).
- Prestations : libellé, description, prix HT, unité (jour, heure, forfait, pièce, mois). Les prix sont stockés en CENTIMES (entiers) ; saisie « 1 234,50 » acceptée.
- Les clients et prestations apparaissent dans la recherche Ctrl+K.
- Base : migration 2 (tables `clients` et `services`). Un test exécute vraiment les migrations dans SQLite (module node:sqlite) pour ne jamais casser le démarrage ; la fabrication GitHub passe en Node 24 pour ça.
- Tests : 54 au total (montants, clients, recherche, migrations SQL).
- Prochaine étape : 3 (devis).

## 2026-10-04 — Phase 2, étape 3 : devis (v0.11.0)
- Section « Devis » : liste (filtre par statut) et éditeur. Brouillon -> Envoyé -> Accepté / Refusé.
- Lignes : libellé, détails, quantité (décimales ok), unité, prix unitaire ; depuis le catalogue ou à la main ; monter/descendre/supprimer. Total HT, mention de franchise de TVA, acompte (30 % par défaut). Enregistrement automatique des brouillons.
- Numérotation D-2026-001 : attribuée À L'ENVOI uniquement, en UNE requête SQL (plus grand numéro de l'année + 1) => continue, sans trou, sans doublon ; index UNIQUE. (Écart avec CLAUDE.md : pas de table `number_sequences`, la séquence est déduite des documents émis, ce qui est atomique.)
- Verrouillage au niveau de la base (déclencheurs SQL) : un devis numéroté ne peut plus être modifié (contenu, lignes) ni supprimé ; seul le statut change. Photo figée à l'envoi (entreprise, client, mention de TVA, CGV).
- Envoi bloqué tant que : pas de client, pas de ligne, libellé vide, dates incohérentes, Réglages > Entreprise incomplets (SIRET...). Brouillon et PDF restent toujours possibles.
- PDF (react-pdf, police IBM Plex Mono) fidèle au modèle rose de Victor + CGV en pages suivantes ; aperçu dans l'app et bouton « Télécharger le PDF » (boîte « Enregistrer sous »).
- Montants : tout en centimes ; quantités en millièmes ; calculs en entiers (arrondi demi vers le haut). Tests : calculs, numérotation, verrous SQL (migrations exécutées dans SQLite) — 69 tests.
- Plugin fs ajouté (écriture du PDF). CSP : frame-src blob: pour l'aperçu.
- Prochaine étape : 4 (factures d'acompte, de solde, avoirs ; modèles bleu et blanc).

## 2026-10-04 — Phase 2, étape 4 : factures, acomptes, soldes, avoirs (v0.12.0)
- Section « Factures » : liste (filtres type / statut), éditeur, PDF (acompte = modèle blanc, facture / solde = modèle bleu, avoir = jaune pâle), aperçu et téléchargement.
- Depuis un devis ACCEPTÉ : « Créer la facture d'acompte » (30 % du total) puis « Créer la facture de solde » : lignes du devis moins « acompte déjà facturé (F-…) ». Acompte + solde = total du devis, au centime (testé). Le solde exige que l'acompte soit déjà émis.
- Avoir : depuis une facture émise ; reprend les lignes en négatif (modifiable pour un avoir partiel) ; refuse de dépasser le montant de la facture (avoirs précédents inclus). Série A-2026-001 séparée de F-2026-001.
- Numérotation F-AAAA-NNN (acompte, solde, standard partagent la même série) : UNE requête SQL, continue, sans trou ni doublon ; REFUSE une date antérieure à celle d'une facture déjà émise de la série (ordre chronologique).
- Verrouillage par déclencheurs SQL : facture émise = plus aucune modification ni suppression (seul le statut peut changer, pour les paiements de l'étape 5).
- Journal d'audit (table `audit_log`, protégée contre la modification et l'effacement) : émission, changements de statut (automatiques par déclencheurs), export PDF (écrit par l'app). Affiché sous chaque facture émise.
- Mentions sur la facture : date d'échéance, date de la prestation (ou période), pénalités de retard, indemnité de 40 € (clients pro uniquement), escompte, mention de franchise de TVA, nature de l'opération « prestation de services », mention clients hors France (si renseignée) ; SIREN / TVA du client dans le cadre Client.
- Émission bloquée si : client / lignes / libellé manquants, dates incohérentes, total négatif, SIRET et réglages manquants, acompte pas encore émis (solde), date antérieure à une facture déjà émise. Avertissements non bloquants : client étranger non validé, SIREN client manquant, IBAN vide.
- Statut « en retard » déduit de l'échéance (non enregistré). « Payée » : étape 5 (paiements).
- Tests : 90 au total (arrondis symétriques des avoirs, acompte + solde, avoirs cumulés, chronologie, déclencheurs et journal exécutés dans SQLite).
- Prochaine étape : 5 (paiements, relances, livre des recettes).

## 2026-10-04 — Phase 2, étape 5 : paiements, relances, livre des recettes (v0.13.0)
- Section « Paiements » : onglet « À encaisser » (reste dû, retard en jours, totaux, boutons Encaisser / Relancer) et onglet « Livre des recettes ».
- Encaissement : date, montant (par défaut le reste dû, plafonné au reste dû), moyen (virement, carte, espèces, chèque, autre), note. Paiements partiels acceptés ; la facture passe en « Payée » quand tout est encaissé, et redevient « Émise » si on supprime le paiement qui la soldait. Un avoir réduit le montant dû ; une facture annulée en totalité par avoir est « Annulée (avoir) ».
- Paiements gérés dans la base (migration 5) : refusés sur brouillon et sur avoir, montant > 0, non modifiables (suppression puis nouvelle saisie), chaque ajout / suppression inscrit au journal d'audit par déclencheurs SQL.
- Relances : à l'échéance + 7 jours (réglable), Form prépare un e-mail (objet et texte modifiables dans Réglages > Entreprise > Relances, mots remplacés automatiquement) : « Ouvrir dans ma messagerie » (mailto via plugin opener) ou « Copier le message ». RIEN n'est envoyé par Form ; chaque préparation est inscrite au journal. Notification Windows quotidienne « N factures à relancer » (comme pour les tâches, app ouverte).
- Livre des recettes : encaissements d'une année en ordre chronologique (date, client, n° de facture, moyen, montant), total, histogramme par mois, export CSV (Excel français : ; et virgule décimale, BOM UTF-8) et export PDF.
- Tests : 102 au total (reste dû, avoirs, factures à relancer, message de relance, livre, CSV, déclencheurs de paiement dans SQLite).
- Prochaine étape : 6 (tableau de bord, plafonds de CA et seuil de franchise de TVA).

## 2026-10-04 — Phase 2, étape 6 : tableau de bord et plafonds (v0.14.0)
- « Tableau de bord » (premier élément de « Mon entreprise ») : encaissé du mois et de l'année, facturé de l'année, total à encaisser et part en retard, devis en attente / brouillons, tâches du jour (tâches arrivées à échéance de la base de tâches), liste des impayés (avec nombre à relancer), histogramme des encaissements par mois, bandeau si les mentions obligatoires manquent.
- Plafonds : barres de progression pour le plafond de CA de la micro-entreprise et la franchise de TVA (seuil de base + seuil majoré). Orange à 80 %, rouge au-delà. Le CA suivi est le CA ENCAISSÉ (livre des recettes).
- Les montants des plafonds sont des PARAMÈTRES (Réglages > Entreprise > Plafonds et seuils), valeurs de départ pour des prestations de services : 77 700 € / 37 500 € / 41 250 €. À VÉRIFIER par Victor (service-public.fr ou comptable) puis case « J'ai vérifié ces montants » ; tant que non confirmés, l'alerte est affichée comme indicative et aucune notification n'est envoyée.
- Notification Windows (une fois par niveau et par année) quand un plafond approche ou est dépassé, si les montants sont confirmés.
- Les messages restent prudents : « à vérifier avec un comptable », jamais de conseil fiscal définitif.
- Tests : 108 au total (CA par mois / année, facturé net d'avoirs, niveaux de plafond, devis en attente).

### Phase 2 : bilan
Réglages entreprise et CGV, clients et prestations, devis, factures (acompte / solde / avoir), paiements, relances, livre des recettes, tableau de bord. « Fini quand » : Victor émet une vraie facture avec l'app (il lui manque son SIRET et l'adresse de domiciliation).
Points ouverts : adresse de domiciliation, SIRET, mention pour clients belges (à valider par un comptable), clause de juridiction (Tournai) des CGV, vérification des plafonds.

## 2026-10-04 — Phase 3, étape 1 : moodboard (v0.15.0)
- Nouveau type de page « Moodboard » (Nouveau… > Moodboard) : toile infinie maison (pas Excalidraw : ergonomie « PureRef » voulue par Victor, plus légère).
- Navigation façon PureRef : molette = zoom sous le curseur ; clic molette, Espace + glisser ou Alt + glisser = déplacer la toile ; clic + glisser sur le vide = sélection par rectangle ; Maj/Ctrl + clic = ajouter à la sélection ; poignées aux coins pour redimensionner (proportions gardées pour les images) ; double-clic sur une image = recadrer dessus ; double-clic dans le vide = nouvelle note ; F / Ajuster = tout afficher ; Ctrl+0 = 100 %.
- Éléments : images (glisser-déposer, Ctrl+V depuis le presse-papiers, bouton), notes (5 couleurs + transparente), couleurs (copie du code au double-clic), liens (coller une URL ou bouton), groupes (Ctrl+G / Ctrl+Maj+G), retourner, premier plan / arrière-plan, dupliquer (Ctrl+D), copier / coller (Ctrl+C/X/V), flèches pour ajuster, Suppr.
- Organiser (menu clic droit ou bouton) : en mosaïque, ligne, colonne, grille ; mettre à la même hauteur / largeur / surface ; aligner. Annuler / rétablir (Ctrl+Z / Ctrl+Y, 100 niveaux). Fond : 5 couleurs. Bouton « toujours au premier plan » (Windows).
- Palette de couleurs extraite des images (coupe médiane, 64×64 px) : copie, ajout à la toile.
- Images : table `board_assets` (migration 6), réduites à 2400 px + miniature de 512 px utilisée en dézoomant ; GIF conservés ; supprimées avec le moodboard (corbeille > supprimer définitivement) ; copiées à la duplication.
- Le plan de la toile (positions, notes, vue) est enregistré automatiquement dans `objects.content`.
- Pas encore : rotation libre, glisser une image depuis une page web (le navigateur ne donne pas le fichier), import de PureRef.
- Tests : 133 au total (zoom, sélection, groupes, organisation, historique, palette, enregistrement).
- Prochaine étape : 2 (assistant Gemini).

## 2026-10-04 — Phase 3, étape 2 : assistant Gemini (v0.16.0)
- Réglages > Assistant IA : clé Gemini rangée dans le coffre Windows (crate `keyring`, jamais dans la base ni les sauvegardes ; l'interface ne peut pas la relire : seules commandes `secret_set` / `secret_exists` / `secret_delete`), choix du modèle (liste chargée depuis l'API, défaut gemini-2.5-flash, modifiable), bouton de test.
- Les appels à Gemini se font côté Rust (reqwest + native-tls), pas depuis l'interface : la clé reste dans le code Rust. Erreurs traduites (clé refusée, quota gratuit atteint, modèle introuvable).
- « ✨ Assistant IA » (barre latérale) : texte → recette (crée une page avec portions, ingrédients cochables, étapes numérotées), texte → lignes de facture (ajoutées à un brouillon de devis ou de facture ; bouton « ✨ Lignes depuis un texte » dans les éditeurs), texte → tâches (ajoutées à une base de tâches ou à une nouvelle base).
- Confidentialité : jamais automatique (clic « Envoyer à Gemini »), seul le texte collé part, aperçu exact du texte envoyé, e-mails / téléphones / IBAN / SIRET masqués par défaut, montants et informations restantes = case de confirmation obligatoire. Rappel que le palier gratuit permet à Google d'utiliser les textes.
- Réponses vérifiées côté app (JSON strict, unités normalisées, prix en centimes, dates valides, aucun prix inventé : prix absent = à compléter). Rien n'est enregistré sans validation de Victor dans l'aperçu.
- Tests : 144 au total (détection de données sensibles, masquage, lecture des réponses).
- ATTENTION : le code Rust (keyring, reqwest) n'a pas pu être compilé sur le PC de Victor ; le premier test réel passera par la fabrication GitHub puis par une vraie clé.
- Prochaine étape : 3 (courrier SeDomicilier par IMAP).
