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
