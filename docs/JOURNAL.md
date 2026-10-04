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

## 2026-10-04 — Phase 3, étape 3 : courrier SeDomicilier par IMAP (v0.17.0)
- Réglages > Courrier : fournisseur (Gmail / Outlook / autre), serveur IMAP (connexion chiffrée port 993 uniquement), adresse, dossier, mot de passe (d'application) rangé dans le coffre Windows, expéditeurs reconnus (défaut : « sedomicilier »), mots d'objet facultatifs, nombre de messages examinés (200), relève automatique (au démarrage + toutes les 30 min).
- Lecture SEULE (code Rust `mail.rs`, crates imap + mailparse + native-tls) : dossier ouvert avec EXAMINE, messages lus avec BODY.PEEK (jamais marqués lus), rien déplacé / supprimé / envoyé. Le contenu complet n'est lu que pour les messages reconnus (≤ 25 Mo) : aperçu de 600 caractères + noms des pièces jointes. Les pièces jointes elles-mêmes ne sont PAS téléchargées.
- Base « Courrier » (type de base `mail`, créée automatiquement, 📬) : Date, Expéditeur, Statut (À traiter / Traité), Pièces jointes, Aperçu ; vues « À traiter » et « Tout le courrier » ; bouton « Relever le courrier » ; entrée « Courrier » dans « Mon entreprise ». Un message déjà classé (même mis à la corbeille) n'est jamais recréé (identifiant de message conservé).
- Bouton « Tester et voir les derniers e-mails » : liste les 30 derniers messages avec ✓ sur ceux qui seraient classés, pour régler les filtres sans avoir besoin d'un exemple.
- Notification Windows « Nouveau courrier » à la relève automatique.
- Tests : 151 (réglages, filtres, absence de doublons, schéma). Le code Rust n'a PAS pu être compilé / essayé sur le PC de Victor : à valider avec la fabrication GitHub puis une vraie boîte Gmail.
- À régler avec Victor : l'expéditeur réel des e-mails SeDomicilier (par défaut « sedomicilier »).

### Phase 3 : bilan
Moodboard (toile maison), assistant Gemini (recette / lignes de facture / tâches, confidentialité), courrier IMAP. « Fini quand » : Victor n'ouvre plus Pinterest pour ses références.

## 2026-10-04 — Import Notion (v0.18.0)
- Réglages > Import Notion : on choisit le .zip d'un export Notion « Markdown & CSV » (ZIP emboîtés acceptés). Form analyse (pages, bases, lignes, images, avertissements), affiche l'arborescence, puis importe avec une barre de progression.
- Tout arrive dans une page « Import Notion du <date> » (déplaçable). L'import ne fait qu'AJOUTER : rien d'existant n'est modifié ni supprimé. Réimporter le même export ne crée pas de doublons (identifiant Notion de 32 caractères conservé dans `properties.notion_id`).
- Pages : hiérarchie reconstruite d'après les dossiers ; Markdown converti par l'analyseur de BlockNote (titres, listes, cases à cocher, citations, tableaux, code, images) ; encarts <aside> -> citations, toggles -> titre en gras, colonnes aplaties ; images intégrées (réduites à 2400 px) ou ignorées (case à décocher).
- Bases de données : CSV « _all » (toutes les colonnes) -> base Form ; types devinés (texte, nombre, date FR/EN, case à cocher, lien, choix unique / multiple) ; lignes reliées à leur page Markdown par le titre ; propriétés de tête de page retirées (déjà dans le CSV).
- Non repris (l'export Notion ne les contient pas ou Form ne les gère pas) : icônes et couvertures, vues (kanban, calendrier, filtres), relations et formules (importées en texte), liens internes entre pages (texte), blocs « synchronisés ».
- Aucun code Windows ajouté (tout en TypeScript) : pas de risque de compilation nouveau.
- Tests : 168 (CSV, noms et chemins, dates, types, préparation du Markdown, plan d'import sur un export fabriqué).
- À valider avec l'export RÉEL de Victor : la structure exacte des exports Notion varie un peu (noms de dossiers, CSV).

## 2026-10-04 — Retours de Victor sur la v0.18.0 (v0.19.0)
- Acompte : la facture d'acompte se crée aussi depuis un devis ENVOYÉ (il passe alors en « accepté » après confirmation), bouton « Facture d'acompte… » dans la liste des factures (liste des devis éligibles) et section « Facturation » visible dès l'envoi du devis. Le solde exige toujours un devis accepté.
- Prestations de départ : Graphisme 300 €/jour et CGI 350 €/jour (TJM de Victor), créées une seule fois au premier lancement (identifiants fixes, jamais en double), modifiables dans « Prestations ».
- Le « + » de la barre d'onglets ressemble à celui de Notion : recherche « Ouvrir dans un nouvel onglet… », « Nouvelle page », pages récentes groupées (Aujourd'hui, Hier, La semaine dernière, Les 30 derniers jours, Plus anciennes) avec leur chemin, aperçu à droite, raccourcis en bas (Ctrl+↵ = nouvel onglet). Même fenêtre pour Ctrl+K.
- Pages : sélection de blocs par rectangle comme dans Notion (partir d'une marge ou d'un espace vide et glisser ; blocs surlignés puis sélectionnés dans l'éditeur).
- Moodboard : même style que le reste (fond = couleur de l'application, claire ou sombre, boutons et panneaux aux couleurs du thème) ; fond à points espacés façon cahier à points, ou grille, ou uni (bouton « Points »).
- Listes de tâches : nouveau bloc « Tâche avec statut » (menu /) à trois états À faire / En cours / Fait (clic sur la case pour changer) ; la liste à cases à cocher normale reste disponible.
- Barre latérale : « + » avant « ⋯ » sur chaque page.
- Tests : 170.

## 2026-10-04 — Courrier, nouvelle page, menu d'application (v0.20.0)
- Courrier : vue à part (comme Clients / Prestations), plus une page. La base « Courrier » est masquée des Pages, Récentes et Favoris ; la vue liste les courriers (date, expéditeur, objet, pièces jointes, aperçu dépliable), filtre « À traiter / Tout », recherche, bouton « Relever le courrier », statut cliquable À traiter / Traité.
- Barre latérale : « + Nouvelle page » crée directement une page vide ; la flèche à côté ouvre moodboard, base de données, base de tâches et les modèles (note rapide, recette, projet), devenus facultatifs.
- Menu d'application façon Notion (clic sur « Form » en haut de la barre latérale) : Fichier (nouvel onglet, rouvrir le dernier onglet fermé Ctrl+Maj+T, fermer l'onglet Ctrl+W, imprimer, quitter), Modifier (annuler, rétablir, couper, copier, copier le lien Ctrl+L / le nom de la page Alt+Ctrl+L, coller, tout sélectionner), Afficher (recharger, barre latérale Ctrl+\, zoom Ctrl++ / Ctrl+- / Ctrl+0, plein écran F11), Historique (précédent / suivant, Alt+← / Alt+→), Fenêtre (réduire, onglet précédent / suivant, agrandir), Aide (à propos, ID d'installation).
- Barre d'onglets : boutons barre latérale, précédent, suivant. Lien « form://page/… » collable dans Ctrl+K pour rouvrir une page.
- Volontairement absent : « Nouvelle fenêtre » (deux fenêtres modifiant les mêmes données risquent de s'écraser), outils de développement, « Réinitialiser et effacer toutes les données locales » (trop dangereux).

## 2026-10-04 — Sélecteur d'icônes façon Notion, emojis Apple, Gemini (v0.21.0)
- Sélecteur d'icône refait : onglets Émoji / Charger / Avec l'IA, bouton Supprimer, filtre en français (sans accents : « coeur » trouve « cœur »), emoji au hasard, teinte de peau mémorisée, Récents, 9 catégories avec raccourcis en bas. Tous les emojis Unicode (≈ 1 900 + variantes de peau), nom et mots-clés en français (paquet emojibase-data).
- Rendu « style Apple » partout (barre latérale, onglets, recherche, titres de page, bases) via le composant `Icon` : images PNG 64 px d'`emoji-datasource-apple`, copiées dans `public/emoji/apple` (ignoré par git, recopié par `predev` / `prebuild` via `scripts/copy-emoji.mjs`). Si une image manque, on retombe sur le texte de l'emoji.
- Charger : une image perso est recadrée en carré, réduite à 128 px et stockée dans la page (data URL).
- Avec l'IA (jamais automatique, seulement au clic ; seule la description part chez Google) : « Proposer des emojis » (Gemini texte, réponse filtrée pour ne garder que de vrais emojis) et « Dessiner une icône » (nouvelle commande Windows `gemini_image`, modèle `gemini-2.5-flash-image`). Le dessin d'images n'est pas toujours dans le palier gratuit : l'erreur est expliquée en français.
- Les images Apple sont protégées par un droit d'auteur : usage privé et personnel uniquement ; à remplacer par un jeu libre (Twemoji, Noto) si Form est un jour distribué ou vendu.
- Tests : 180 (liste, recherche, teintes, noms de fichiers, récents, réponses Gemini).
- Non vérifié sur Windows réel : l'appel `gemini_image` (compilation Rust uniquement par la CI, nom du modèle d'image susceptible de changer).

## 2026-10-05 — Devis possibles sans SIRET (v0.21.1)
- Un devis peut être envoyé sans SIRET (les autres mentions restent exigées : nom légal, mention EI, adresse). Le PDF affiche « SIRET : en cours d'obtention ».
- Une facture reste bloquée sans SIRET : mention légale obligatoire, et une facture émise est verrouillée et numérotée sans trou (impossible de la corriger ensuite). Brouillons de facture toujours possibles.
- Tests : 181.

## 2026-10-05 — Bloc /moodboard dans les pages (v0.22.0)
- Menu « / » > « Moodboard » : insère dans la page un cadre contenant un moodboard complet (mêmes outils que la page moodboard). Le moodboard est une vraie page enfant de la page courante (visible dans la barre latérale), donc rien n'est dupliqué.
- Dans le cadre : « Agrandir / Réduire » (440 ou 760 px de haut) et « Ouvrir en pleine page ↗ » qui ouvre le même moodboard dans l'espace entier. Si le moodboard est supprimé, le cadre l'indique.
- Non testé : copie d'une page contenant un cadre (le cadre pointe alors vers le même moodboard).

## 2026-10-05 — Menu « / » façon Notion (v0.23.0)
- Nouveau menu `/` compact : sections (Blocs de base, Médias, Base de données), icône, nom, raccourci à droite, pied « Fermer le menu · esc ».
- Contenu : Texte, Titres 1 à 4, listes (puces, numérotée, tâches, tâche avec statut), menu déroulant, Page, Encadré, Citation, Tableau, Séparateur, Code, titres déroulants 1 à 3, 2 à 5 colonnes, Image, Vidéo, Audio, Fichier, Moodboard, Base de données – Pleine page.
- « Page » et « Base de données – Pleine page » créent une page enfant et insèrent un lien (bloc `subpage`) qui l'ouvre, comme Notion.
- Correctif : le clic de souris sur un élément du menu ne faisait rien (le menu se fermait à l'appui). Le bloc est maintenant inséré dès l'appui. Le menu passait aussi derrière le cadre moodboard : corrigé.
- Pas repris de Notion (pas d'équivalent dans Form pour l'instant) : bases intégrées dans la page, vues liées, graphiques, formulaire, table des matières, équation, bouton, aperçu de lien web, blocs synchronisés, onglets, aperçu à droite au survol.

## 2026-10-05 — Emojis manquants et catégorie Encadré (v0.23.1)
- Bug : les noms de fichiers Apple sont écrits sur 4 chiffres minimum (« 00a9 », « 0023-fe0f-20e3 ») ; ©, ®, #, *, 0 à 9 (touches) s'affichaient donc sans image. Corrigé.
- Sélecteur : section « Encadré » (💡 👉 ⚠️ 🔥 📌 ✅ ...) et raccourci « Récents » dans la barre du bas.
- Limites connues : 8 emojis Unicode 16 n'ont pas encore de dessin Apple dans le jeu utilisé (🫪 🫯 🫈 🫍 🛘 🪊 🪎 🧑‍🩰) : retirés de la liste. ♀️ ♂️ ⚕️ et quelques teintes de peau mélangées n'ont pas d'image : affichés avec la police de Windows.
- Pas fait : onglet « Icônes » (jeu d'icônes monochromes de Notion).

## 2026-10-05 — Moodboard allégé dans les pages (v0.24.0)
- Le cadre `/moodboard` utilise une version allégée : seulement « Images » et « Ajuster » (on peut toujours déposer ou coller des images, double-cliquer pour une note, zoomer à la molette, déplacer la toile) ; plus de barre du bas, de palette, d'organisation, de fonds.
- Poignée en bas du cadre : glisser pour agrandir ou réduire (160 à 1600 px), hauteur mémorisée dans la page. Remplace les boutons Agrandir / Réduire.
- « Ouvrir en pleine page ↗ » ouvre la version complète.

## 2026-10-05 — Finitions façon Notion (v0.25.0)
- Menu « ⋯ » de la page (en haut à droite) : police (par défaut, serif, mono), texte réduit, pleine largeur, verrouiller la page (lecture seule, titre compris), copier le lien, dupliquer, exporter en Markdown (boîte « Enregistrer sous »). Réglages gardés dans `properties.ui` de la page (autres propriétés intactes) ; non proposés pour les lignes de base de données.
- Mentions : taper `@` puis le nom d'une page ouvre une liste (sans accents, 10 résultats) ; la mention est un lien cliquable au milieu du texte (bloc en ligne `mention`), qui suit le titre et l'icône de la page.
- Bloc « Table des matières » (menu /, mot « sommaire ») : titres de la page (niveaux 1 à 4, indentés), cliquables, mis à jour pendant la frappe.
- Tests : 185 (réglages de page, noms de fichiers d'export).
- Non fait, à prioriser : bases de données intégrées dans une page, rétroliens (« mentionné dans »), aperçu de lien web, équation, bouton, export PDF, onglet « Icônes », partage/publication (hors sujet : app locale).

## 2026-10-05 — Prestation Couture (v0.26.0)
- Nouvelle prestation « Couture » : 12 € / heure (confection, retouches, réparations), ajoutée une seule fois au catalogue, y compris pour une installation existante (réglage `default_couture_seeded`, identifiant fixe `default-couture`). Modifiable ou supprimable dans « Prestations » : une suppression n'est pas recréée.
- Tests : 186.

## 2026-10-05 — Bases de données intégrées dans les pages (v0.27.0)
- Menu / > « Base de données – Intégrée » : crée une base (page enfant) et l'affiche dans un cadre au milieu de la page, avec toutes ses vues (tableau, liste, kanban, calendrier, galerie), filtres, tris, colonnes et lignes. Titre discret éditable, « Ouvrir en pleine page ↗ ».
- C'est la même base que la version pleine page : tout ce qu'on change d'un côté apparaît de l'autre. Si la base est supprimée, le cadre l'indique.
- Non fait : lier une base EXISTANTE (vue liée), pour l'instant chaque cadre crée une nouvelle base.

## 2026-10-05 — Encadré complet et menu de bloc façon Notion (v0.28.0)
- Poignée ⋮⋮ d'un bloc (clic) : menu avec le type du bloc, Transformer en (texte, titres 1-3, listes, tâche avec statut, menu déroulant, citation, encadré), Couleur (texte et fond), Modifier l'icône (encadré), Copier le lien du bloc, Dupliquer, Supprimer, et le nombre de mots et de caractères de la page.
- Encadré : icône cliquable (sélecteur d'emojis complet, ou retirée), 9 couleurs de fond (claires ou foncées selon le thème) et couleurs de texte.
- Lien de bloc : `form://page/<page>#<bloc>` ; collé dans Ctrl+K, ouvre la page et fait défiler jusqu'au bloc.
- Tests : 189.
- Non fait : texte sur plusieurs blocs dans un encadré (listes, images dedans), Déplacer vers…, Commenter, Suggérer des modifications, Demander à l'IA depuis le menu (l'assistant IA existe déjà dans la barre latérale).

## 2026-10-05 — Mes tarifs sur le tableau de bord (v0.28.1)
- Carte « Mes tarifs » sur le tableau de bord : chaque prestation active avec son prix et son unité (300 € / jour, 12 € / heure...), lien « Modifier mes prestations ».
- Rappel : le catalogue sert à remplir les lignes des devis et factures (copie des libellé, description, unité, prix au moment de l'ajout ; modifier un prix plus tard ne change jamais un document existant).

## 2026-10-05 — « Prestations » devient « Tarifs » (v0.28.2)
- La page, le bouton de la barre latérale, « Nouveau tarif » et le menu « + Depuis mes tarifs… » des devis et factures utilisent le mot « Tarifs ». Les données ne changent pas.
- La carte « Mes tarifs » du tableau de bord est retirée (les tarifs ne vivent que dans la page Tarifs).

## 2026-10-05 — Guide « premier client » (v0.29.0)
- Carte en haut du tableau de bord : 9 étapes cochées automatiquement d'après les données (entreprise remplie, client, devis créé, envoyé, accepté, SIRET, facture d'acompte, facture de solde, paiement). L'étape en cours est en surbrillance avec une aide courte et un bouton qui ouvre la bonne page.
- « Masquer le guide » (mémorisé dans le réglage `guide_hidden`) ; le lien « Afficher le guide » le ramène.
- L'étape SIRET est placée avant les factures : les devis n'en ont pas besoin (v0.21.1).
- Logique dans `src/lib/guide.ts`. Tests : 193.

## 2026-10-05 — Nouvelle page façon Notion, guide retiré (v0.30.0)
- Barre du haut de chaque page : chemin (parents / page), « Dernière modification : à l'instant / il y a 5 min / hier à 00:53 », menu ⋯, favori, corbeille. Collée en haut quand on fait défiler.
- Une page sans titre s'appelle « Nouvelle page » (titre, barre latérale, onglets, recherche, déplacer, liens…).
- « Ajouter une icône » et « Ajouter une image de couverture » (avec leur pictogramme) apparaissent au survol du titre. Pas de « Ajouter un commentaire » : les commentaires n'existent pas dans Form.
- Le guide « premier client » (v0.29.0) est retiré à la demande de Victor : composant, logique et tests supprimés.
- Tests : 191.

## 2026-10-05 — Tarifs sans archivage (v0.30.1)
- Page Tarifs : plus de case « Afficher les archivés » ni de bouton « Archiver ». À la place, « Supprimer » (avec confirmation) dans la fiche d'un tarif.
- Supprimer un tarif ne touche pas aux devis et factures déjà faits : leurs lignes gardent leur propre copie du libellé, de l'unité et du prix. L'archivage reste disponible pour les clients (leurs documents doivent rester rattachés à eux).

## 2026-10-05 — Encadré : pictogramme, icône retirable, texte d'aide (v0.30.2)
- Menu / : l'Encadré a le pictogramme « T dans un carré arrondi » comme Notion.
- Icône supprimée (Supprimer dans le sélecteur) : le cadre reste vide, sans icône ni espace ; « Modifier l'icône » (menu ⋮⋮) la remet.
- Encadré vide : texte d'aide « Tapez « / » pour afficher les commandes » (pas de « Espace pour l'IA » : pas d'IA dans l'éditeur).

## 2026-10-05 — Page d'accueil avec widgets (v0.31.0)
- Nouvelle vue « Accueil » (première entrée de la barre latérale, affichée au démarrage) : « Bonjour / Bonsoir » et la date, puis des widgets.
- Widgets : Pages récentes (cartes), Favoris, Résumé de l'activité (encaissé du mois et de l'année, à encaisser, devis en attente — cliquables), Tâches du jour, Bloc-notes (texte libre enregistré tout seul), Base de données épinglée (les 8 dernières lignes d'une base au choix).
- « Personnaliser » : monter, descendre, retirer, et « Ajouter un widget » (plusieurs blocs-notes ou bases possibles). Disposition mémorisée dans le réglage `home_widgets` ; notes dans `home_note_<id>`.
- Logique dans `src/lib/home.ts`. Tests : 197.
- Non fait : widgets en colonnes côte à côte / glisser-déposer, nom de l'utilisateur dans le bonjour, agenda (pas de calendrier dans Form), widget graphique du chiffre d'affaires.

## 2026-10-05 — Accueil : glisser-déposer et calendrier (v0.32.0)
- Glisser-déposer des widgets : dans « Personnaliser », on attrape un widget (poignée ⋮⋮ ou n'importe où sur le bloc) et on le dépose avant ou après un autre ; un trait bleu montre l'endroit. Les flèches ↑ ↓ restent disponibles.
- Nouveau widget « Calendrier » : grille du mois (lundi en premier), navigation par mois, « Aujourd'hui », un point par type d'événement ; un clic sur un jour liste ses événements, un clic sur un événement l'ouvre.
- Événements : lignes de toutes les bases ayant une propriété « Date » (courrier exclu), tâches non terminées, échéances des factures émises non payées, fin de validité des devis envoyés.
- Logique dans `src/lib/homeCalendar.ts` et `reorderWidget`. Tests : 200.
- Non fait : créer un événement depuis le calendrier de l'accueil (on le fait dans une base avec une vue Calendrier), vue semaine, synchronisation avec un agenda externe.

## 2026-10-05 — Accueil : calendrier complet, placement des widgets (v0.33.0)
- Calendrier : trois affichages (Mois, Semaine, Agenda), choix mémorisé. Semaine : 7 colonnes lundi-dimanche avec les événements de chaque jour. Agenda : liste compacte des prochaines dates qui ont quelque chose de prévu (sans grille). Navigation par mois ou par semaine, « Aujourd'hui ».
- Un clic sur un jour le sélectionne, affiche ses événements et propose « Ajouter une tâche le … » : la tâche est créée dans la base Tâches (créée au besoin) avec cette échéance, sans quitter l'accueil. Elle apparaît aussi dans « Tâches du jour » et les rappels.
- Glisser-déposer refait avec la souris (poignée ⋮⋮), plus fiable que celui du navigateur : un trait bleu indique la place.
- Demi-largeur : un widget peut occuper la moitié de la ligne ; deux widgets « demi » se placent côte à côte (bouton à côté des flèches).
- Tests : 203.
- Non fait : tâches avec heure, déplacer un événement d'un jour à l'autre par glisser-déposer dans le calendrier, synchronisation avec un agenda externe.

## 2026-10-05 — Événements dans le calendrier de l'accueil (v0.33.1)
- Sous le calendrier, on choisit « Événement » (par défaut) ou « Tâche » avant d'ajouter. Un événement n'est plus une tâche : pas de statut, pas de rappel.
- Les événements vont dans une base « Agenda » 📅 (créée au premier ajout : Nom, Date, Notes ; vues Calendrier et Tableau), visible dans les pages et modifiable comme n'importe quelle base. Point vert dans le calendrier, étiquette « Événement ».
- Schéma `kind: 'agenda'`. Tests : 203.
