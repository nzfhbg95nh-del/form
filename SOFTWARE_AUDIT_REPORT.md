# Form — rapport d'audit

Date : 2026-11-03. Branche : `travail`. Portée : audit réel mais borné (une session). Ce qui n'a pas été vérifié est dit clairement plus bas.

## 1. Résumé
Form est en bon état : le projet compile sans erreur, les 736 tests automatiques passent, aucune faille connue dans les dépendances (`npm audit` : 0), et tous les écrans de la barre latérale s'ouvrent sans erreur dans un navigateur de test. Le défaut le plus net était le temps de démarrage : tout le code (éditeur compris) était chargé d'un bloc, 2 258 ko. Il est maintenant de 634 ko (−72 %), les gros écrans se chargent à leur première ouverture.

Points forts : logique d'argent testée (numérotation, totaux, acomptes, verrouillage), données locales, import/export de moodboard testés, sélection de blocs et raccourcis testés.
Points faibles : aucun test de bout en bout, le code Rust et les fonctions propres à l'app Windows ne sont pas vérifiables dans le navigateur de test, 135 avertissements du lecteur de code.

## 2. Inventaire
- Écrans : Accueil, Tableau de bord, Clients, Tarifs, Devis, Factures, Paiements / Livre des recettes, Réglages (Général, Interface, Bibliothèque, Mon entreprise, Importer), Corbeille, Pages (éditeur de blocs), Bases de données (5 vues), Recettes, Moodboards (liste + éditeur), Bibliothèque (Tout, Collections, Moodboards, Carte, Doublons).
- Données : SQLite local ; sauvegarde quotidienne ; export des moodboards en `.formboard`.
- Intégrations : Tauri 2, Rust (IA CLIP locale, sauvegarde, doublons, import des réseaux), GitHub Actions (versions et bêta).

## 3. Audit fonctionnel — ce qui a été exécuté
| Parcours | Résultat |
|---|---|
| Démarrage de la version « production » (`vite build` + `preview`) | OK, aucune erreur console |
| Ouvrir les 14 entrées de la barre latérale | OK, chaque écran affiche son contenu |
| Nouvelle page → titre → Entrée → texte | OK (curseur dans le titre, puis dans le corps) |
| Recharger la page du navigateur | OK, titre et texte retrouvés |
| Ctrl+D dans le texte | OK : duplique le bloc, pas la page |
| Ctrl+K : recherche dans le contenu | OK, trouve la page et montre un aperçu |
| Formulaire « Nouveau client » | OK ; champs tous étiquetés ; SIREN/SIRET douteux = avertissement, pas blocage (voulu) |
| Corbeille : mettre une page, la restaurer | OK |
| Import puis export d'un moodboard (fichier de test) | OK : image, note, couverture retrouvées |
| Sélection de blocs, Suppr, Ctrl+A en deux temps, grille d'images | OK (testés dans la session précédente) |

Problèmes constatés : voir `AUDIT_PROGRESS.md` (tableau des problèmes).

## 4. Réparations faites
- `src/App.tsx` : les écrans lourds sont chargés à la demande (`lazy` + `Suspense`).
- `src/components/RecipeCard.tsx` (nouveau) : la carte de recette sort de `RecipesView.tsx`, pour que l'accueil ne charge plus l'éditeur. `HomeWidgets.tsx` et `RecipesView.tsx` l'importent.
- `src/components/SearchPalette.tsx` : rôles d'accessibilité (dialogue, champ de recherche lié à la liste, options sélectionnables).
- Vérifié après chaque changement : `tsc`, 736 tests, `vite build`, parcours dans le navigateur.

## 5. Performance
Méthode : `vite build` avant et après, même machine, tailles lues dans `dist/assets`.

| Mesure | Avant | Après |
|---|---|---|
| Paquet principal chargé au démarrage | 2 258 ko | 634 ko (−72 %) |
| Éditeur de blocs (BlockNote) | dans le paquet principal | chargé à la première page ouverte |
| Chargement de l'accueil dans le navigateur (version production) | non mesuré avant | domContentLoaded ≈ 62 ms, 15 fichiers JS |

Limites : le temps de démarrage « avant » n'a pas été mesuré en conditions identiques ; la mesure dans le navigateur de test n'est pas celle de la fenêtre Tauri. Restent gros : ≈ 1 160 ko (PDF, chargé seulement à l'émission d'un document), ≈ 590 ko et ≈ 420 ko de bibliothèques partagées. Non mesuré : rendus de l'éditeur, mémoire, base de données.

## 6. UX / interface
- À garder : sobriété façon Notion, raccourcis (Ctrl+K, Ctrl+D, Échap/Maj+↓), page vide avec « Premiers pas… », sélection et menus de blocs, export/import de moodboard.
- À améliorer : le temps de chargement perçu au premier affichage d'un écran lourd (un écran vide quelques millisecondes, fallback à `null`) ; les écrans de la bibliothèque sans l'app Windows restent sur « Chargement… » (sans objet pour toi).
- À retirer ou ajouter : rien de proposé sans preuve d'usage. Idée à discuter : case « + Ajouter une image » en fin de grille, bouton « Réafficher l'aide » dans les Réglages.

## 7. Sécurité et intégrité
- `npm audit --omit=dev` : 0 vulnérabilité.
- Données 100 % locales, pas de serveur ni de compte. Clé IA prévue dans le trousseau Windows (phase 3).
- Factures émises verrouillées, numérotation testée (tests automatiques).
- Non fait : revue du code Rust, des permissions Tauri en détail, des imports de fichiers (Notion) face à des fichiers piégés.

## 8. Tests
- `tsc` : 0 erreur. `vitest` : 79 fichiers, 736 tests réussis. `vite build` : réussi. `oxlint` : 135 avertissements, 0 erreur.
- Non exécutés : `cargo test` (l'app en direct bloque la base), tests de bout en bout, accessibilité automatique (contrastes, lecteur d'écran), responsive mobile/tablette (app Windows seulement).

## 9. Reste à faire
Rust non testé ; app Windows non vérifiée ; 135 avertissements ; pas de test de bout en bout ; contrastes non vérifiés.

## 10. Feuille de route proposée
- Tout de suite : lancer `cargo test --lib` app fermée ; essayer les parcours dans l'app Windows.
- Court terme : Playwright sur 5 parcours (page, facture, moodboard, recherche, corbeille) ; réduire les avertissements « composant défini dans un composant ».
- Moyen terme : mesurer la mémoire de l'éditeur sur de longues pages ; vérifier les contrastes en thème clair et sombre.
- Long terme : phase 4 (facture électronique), qui demandera de nouveaux tests sur les mentions.

## 11. Évaluation finale (critères explicites, pas des mesures objectives)
- Fiabilité fonctionnelle : bonne sur ce qui a été exécuté ; non vérifiée sur la partie Windows.
- Performance : démarrage nettement amélioré ; reste non mesuré à l'usage.
- Accessibilité : champs étiquetés, recherche corrigée ; reste non évaluée en profondeur.
- Sécurité : aucune faille connue dans les dépendances ; revue Rust non faite.
- Qualité du code : types stricts, tests nombreux ; avertissements de style React à réduire.
- Prêt pour un usage réel : oui pour les pages, moodboards et la facturation testée ; à confirmer dans l'app Windows.
