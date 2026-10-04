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
