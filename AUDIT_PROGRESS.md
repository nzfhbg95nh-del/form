# Audit de Form — suivi de travail

Dernière mise à jour : 2026-11-03. Ce fichier permet de reprendre l'audit si la session s'interrompt.

## Zones découvertes
- Interface : 297 fichiers TypeScript/React dans `src/`, 79 fichiers de tests (736 tests).
- Écrans : Accueil, Tableau de bord, Clients, Tarifs, Devis, Factures, Paiements (+ Livre des recettes), Réglages (5 pages), Corbeille, Pages (éditeur BlockNote), Bases de données (tableau, kanban, calendrier, galerie, liste), Recettes, Moodboards (éditeur + liste), Bibliothèque (Tout, Collections, Moodboards, Carte, Doublons).
- Données : SQLite local (`tauri-plugin-sql`) ; dans le navigateur de test, un dépôt « localStorage » équivalent.
- Intégrations : Tauri (fichiers, fenêtres, notifications), Rust (IA CLIP locale, import des réseaux, sauvegarde, doublons), GitHub Actions (build des versions).

## Zones testées (réellement exécutées)
Voir la section « Tests » de `SOFTWARE_AUDIT_REPORT.md`. En résumé : démarrage, les 14 entrées de la barre latérale, création/écriture/rechargement d'une page, Ctrl+D, recherche Ctrl+K, formulaire client, corbeille + restauration, import/export de moodboard, sélection de blocs, grille d'images.

## Problèmes trouvés
| # | Gravité | Problème | État |
|---|---------|----------|------|
| 1 | P1 | Un seul paquet JavaScript de 2 258 ko chargé au démarrage (tous les écrans, l'éditeur compris) | Corrigé : 634 ko (−72 %) |
| 2 | P2 | La carte de recette (accueil) importait toute la page Recettes et son éditeur | Corrigé (fichier `RecipeCard.tsx`) |
| 3 | P3 | Fenêtre de recherche sans rôles d'accessibilité (dialogue, liste, options) | Corrigé |
| 4 | P3 | Écrans de la bibliothèque (Collections, Carte) : appels Tauri sans garde dans le navigateur (« Chargement… » sans fin, erreur `invoke`) | Non corrigé (n'existe que hors de l'app Windows) |
| 5 | P3 | 135 avertissements du lecteur de code (surtout règles React « composant défini dans un composant », « setState dans un effet ») | Non corrigé (aucun bug constaté) |
| 6 | Info | SIREN/SIRET invalides acceptés avec un avertissement (choix voulu : avertissement, pas blocage) | Conforme à la conception |

## Tests ajoutés / exécutés
- Ajoutés pendant la session précédente (même branche) : `boardFile.test.ts` (14), `imageGrid.test.ts`, `editorHint.test.ts`, `selectionBox.test.ts`.
- Exécutés : `tsc`, `vitest` (736/736), `oxlint`, `vite build`, `npm audit` (0 faille), parcours dans le navigateur de l'aperçu.

## À faire / non testé
- Tests Rust (`cargo test --lib`) : non lancés (l'app en direct tourne ; elle bloque la base).
- Aucune vérification dans l'app Windows elle-même (Tauri) : IA, téléchargements, fenêtres flottantes, notifications.
- Pas de test de bout en bout automatique (pas de Playwright dans le projet).
- Accessibilité : pas de vérification de contraste ni de lecteur d'écran.
- Mesures de performance de l'éditeur (rendus, mémoire) : non faites.

## Blocages
- L'aperçu navigateur n'a pas de Tauri : tout ce qui passe par Rust ne peut pas s'y vérifier.
