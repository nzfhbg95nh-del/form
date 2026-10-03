# Form — le Notion du créatif freelance

Ce fichier est le cahier des charges du projet. Lis-le en entier avant toute action, et relis-le au début de chaque session.

## 1. Qui est l'utilisateur

- Victor, graphiste / artiste CGI freelance, vit en Belgique, clients surtout à Paris (et quelques-uns à Bruxelles).
- Micro-entreprise française, domiciliée chez SeDomicilier, en franchise de TVA.
- **Il ne code pas du tout.** Tu écris 100 % du code. Il teste, juge et décide.
- Il adore Notion : l'app doit en reprendre l'ergonomie.
- Usage : lui seul. Pas de comptes utilisateurs, pas de vente prévue.
- Plateforme : **PC Windows uniquement**. Pas d'app mobile.
- Budget : **0 € par mois**. Aucun service payant.

## 2. Règles de travail (importantes)

1. **Langue** : tu parles à Victor en français simple, sans jargon. L'interface de l'app est en français.
2. **Petits pas** : une fonctionnalité à la fois. À la fin de chaque étape : ce qui a été fait, comment le tester (clics précis), ce qui vient ensuite.
3. **Il n'installe pas d'outils de dev s'il peut l'éviter.** L'installateur Windows (.msi) est fabriqué par GitHub Actions. Victor télécharge la version depuis la page Releases de GitHub.
4. **Avant de coder une phase**, présente ton plan de la phase en 5 à 10 lignes et attends son accord.
5. **Ne passe jamais à la phase suivante** sans que Victor confirme que la phase en cours tourne bien chez lui.
6. **Commits** fréquents, messages clairs en français. Une branche par fonctionnalité, fusion sur `main` quand c'est testé.
7. **Tests automatiques** obligatoires pour tout ce qui touche à l'argent : numérotation, totaux, acomptes, mentions légales.
8. Quand une décision technique a un impact visible pour lui, explique-la en une phrase et propose un choix par défaut.
9. Tiens à jour `docs/JOURNAL.md` : date, ce qui a été fait, ce qui reste.

## 3. Stack technique (décidée)

| Besoin | Choix |
| --- | --- |
| App desktop | Tauri 2 (Windows) |
| Interface | React + TypeScript + Vite |
| Style | Tailwind CSS + composants shadcn/ui, style sobre façon Notion |
| État | Zustand |
| Éditeur de blocs | BlockNote (menu « / », poignée de glisser ⋮⋮, blocs imbriqués) |
| Tables / vues | TanStack Table (tableau), vues kanban / calendrier / galerie maison |
| Base de données | SQLite local via `tauri-plugin-sql`, migrations versionnées |
| PDF | `@react-pdf/renderer` (factures et devis) |
| Moodboard (phase 3) | Excalidraw (licence MIT) ou toile maison |
| IA (phase 3) | API Gemini, palier gratuit, clé stockée dans le trousseau Windows |
| Emails (phase 3) | Lecture IMAP côté Rust |
| Sauvegarde | Copie quotidienne de la base + des fichiers vers un dossier choisi (OneDrive / Google Drive) |
| Build | GitHub Actions + `tauri-action` → .msi publié dans GitHub Releases |
| Code | Dépôt GitHub privé |

Pas de serveur, pas de cloud, pas de synchro. Tout est local.

## 4. Architecture des données

Modèle hybride :

**A. Objets libres (façon Notion)** — table `objects`
- `id` (UUID), `type` (page, database, row, task, recipe, moodboard…), `parent_id`, `title`, `icon`, `cover`, `properties` (JSON), `content` (JSON BlockNote), `position`, `is_favorite`, `created_at`, `updated_at`, `deleted_at` (corbeille).
- Tables annexes : `databases` (schéma des propriétés en JSON : texte, nombre, date, select, multi-select, case, relation, URL, fichier), `views` (type de vue, filtres, tris, groupements), `relations`, `tags`, `object_tags`, `versions` (historique des pages).

**B. Objets business (règles strictes)** — tables dédiées
- `clients` (nom, raison sociale, SIREN/SIRET, n° TVA intracom, adresse, pays, email, contact, notes)
- `services` (catalogue de prestations : libellé, description, prix unitaire, unité)
- `quotes` + `quote_lines` (devis : numéro, date, validité, statut brouillon / envoyé / accepté / refusé, acompte en %)
- `invoices` + `invoice_lines` (type : acompte / solde / standard / avoir ; statut brouillon / émise / payée / en retard ; lien vers le devis)
- `payments` (date, montant, moyen)
- `number_sequences` (séquence par type et par année)
- `audit_log` (toute action sur une facture émise)
- `settings` (identité de l'entreprise, mentions, IBAN, logo, modèle de facture, dossier de sauvegarde)

Les objets business apparaissent aussi dans la barre latérale et la recherche, comme des pages.

## 5. Règles de facturation (à respecter strictement)

Victor est micro-entrepreneur français en franchise de TVA.

- **Numérotation** unique, continue, sans trou, par année : `F-2026-001`, devis `D-2026-001`, avoirs `A-2026-001`. Le numéro n'est attribué qu'à l'émission (un brouillon n'a pas de numéro).
- **Une facture émise est verrouillée.** Aucune modification possible. Correction uniquement par avoir.
- **Mentions obligatoires** : nom + « EI » ou « Entrepreneur individuel », SIRET, adresse de domiciliation, numéro, date d'émission, date de la prestation, nom et adresse du client, détail des prestations (quantité, prix unitaire, total), total, date d'échéance, taux des pénalités de retard, indemnité forfaitaire de recouvrement de 40 € (clients pros), conditions d'escompte (« Pas d'escompte pour paiement anticipé »).
- **Mention TVA** selon la date d'émission :
  - jusqu'au 31/12/2026 : « TVA non applicable, art. 293 B du CGI »
  - à partir du 01/01/2027 : « TVA non applicable, article L. 233-1 du CIBS »
  - le texte doit être un paramètre modifiable, avec une valeur par défaut basée sur la date.
- **Acomptes** : un devis accepté peut générer une facture d'acompte (X %). La facture de solde reprend le total et déduit les acomptes déjà facturés.
- **Clients hors France (Belgique)** : prévoir des champs pour le n° TVA intracom du client et une mention spécifique paramétrable. Afficher un avertissement « à faire valider par un comptable » tant que la mention n'est pas confirmée dans les réglages.
- **Relances semi-automatiques** : à l'échéance + 7 jours, l'app prépare un email de relance (modèle modifiable). Victor valide avant tout envoi. Rien ne part tout seul.
- **Livre des recettes** : registre chronologique des encaissements (date, client, n° facture, montant, moyen de paiement), exportable en CSV et PDF.
- **Préparer la facture électronique** (phase 4, avant le 01/09/2027) : nouvelles mentions (SIREN du client, nature de l'opération « prestation de services »), export Factur-X, envoi via une plateforme agréée. Dès la phase 2, stocker ces données dans le modèle pour ne rien refaire ensuite.
- **Modèle de facture** : Victor fournira son propre modèle (PDF ou image). Le PDF généré doit le reproduire fidèlement. En attendant, fais un modèle sobre et propre.

## 6. Feuille de route

### Phase 0 — Fondations
- Créer le projet Tauri 2 + React + TS + Tailwind + shadcn/ui.
- Base SQLite + système de migrations.
- Mise en page de l'app : barre latérale à gauche (pages, favoris, corbeille, réglages), zone principale, thème clair / sombre.
- GitHub Actions : à chaque tag `v*`, construire le .msi et le publier dans Releases.
- Sauvegarde automatique quotidienne + bouton « Exporter tout ».
- **Fini quand** : Victor installe le .msi, l'app s'ouvre, il crée une page vide qui est toujours là après redémarrage.

### Phase 1 — Le Notion
- Pages en blocs avec BlockNote : titres, texte, listes, cases à cocher, citations, séparateurs, images, code, callouts, toggles, colonnes.
- Pages imbriquées, glisser-déposer dans la barre latérale, icône et couverture de page, favoris, corbeille.
- Bases de données : propriétés typées, vues tableau / kanban / calendrier / galerie / liste, filtres, tris, groupements.
- Tâches (base de données prête à l'emploi avec statut, échéance, priorité) + rappels par notification Windows.
- Modèles de pages : recette (ingrédients, étapes, portions, photo), projet, note rapide.
- Recherche globale Ctrl+K, capture rapide par raccourci global.
- Import Notion (via l'API Notion avec un jeton d'intégration, ou depuis un export Markdown/CSV).
- **Fini quand** : Victor utilise l'app une semaine à la place de Notion.

### Phase 2 — La micro-entreprise
- Réglages entreprise (identité, SIRET, adresse, IBAN, logo, mentions).
- Clients, catalogue de prestations.
- Devis → acceptation → facture d'acompte → facture de solde, en quelques clics.
- Saisie simple : Victor écrit les lignes, l'app calcule et génère le PDF.
- Suivi des paiements, statuts, relances semi-automatiques.
- Livre des recettes, chiffre d'affaires par mois et par année, alerte à l'approche des plafonds de la micro-entreprise et du seuil de franchise de TVA (seuils en paramètres, à vérifier avec Victor).
- Tableau de bord : CA du mois, impayés, tâches du jour.
- Tests automatiques sur numérotation, totaux, acomptes, verrouillage, mentions.
- **Fini quand** : Victor émet une vraie facture avec l'app.

### Phase 3 — Moodboard et IA
- Moodboard : toile infinie, images par glisser-déposer ou collage, liens, notes, couleurs, groupes ; palette extraite des images.
- Gemini (bouton, jamais automatique) : transformer un texte collé en recette, en lignes de facture, ou en liste de tâches. Ne jamais envoyer montants ou coordonnées clients sans confirmation.
- Emails : connexion IMAP à la boîte de Victor, détection des emails SeDomicilier (courrier scanné) et classement dans une base « Courrier ».
- **Fini quand** : Victor n'ouvre plus Pinterest pour ses références.

### Phase 4 — Facture électronique (avant le 01/09/2027)
- Export Factur-X (PDF/A-3 + XML), nouvelles mentions, choix d'une plateforme agréée gratuite ou peu chère avec API, e-reporting.

## 7. Hors périmètre (ne pas construire)

- App mobile, synchro, serveur, comptes utilisateurs.
- Prospection / CRM (peut-être plus tard).
- Vente d'objets / boutique (plus tard).

## 8. Points ouverts

- Modèle de facture de Victor : à recevoir.
- Mentions pour les clients belges : à valider par un comptable.
- Nom de l'app : « Form » (décidé par Victor).

