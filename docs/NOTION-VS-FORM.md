# Notion contre Form — liste des écarts

Établie le 23/11/2026 à partir du centre d'aide officiel de Notion (notion.com/help) et du code de Form.
But : que Form se comporte « presque exactement » comme Notion, **surtout dans les petits gestes de l'éditeur**.

Légende : ✅ déjà comme Notion · ⚠️ existe mais différent · ❌ manque · ❓ à vérifier au vrai clavier par Victor
Priorité : **P1** = gestes de tous les jours (à faire d'abord) · **P2** = utile · **P3** = rare / plus tard

---

## 1. Glisser-déposer des blocs (le plus important pour Victor)

| Geste dans Notion | Form | Prio |
|---|---|---|
| Prendre un bloc par ⋮⋮ et le lâcher entre deux blocs | ✅ | |
| Lâcher à gauche / à droite d'un bloc pour faire des colonnes | ✅ | |
| **Pendant qu'on tient un bloc, la molette fait monter / descendre la page** | ✅ (23/11 : glisser maison, à confirmer dans la bêta) | |
| **La page défile toute seule quand on approche le haut ou le bas de l'écran en tenant un bloc** (vitesse selon la distance au bord) | ✅ (23/11) | |
| Fine ligne bleue qui montre exactement où le bloc va tomber, y compris dans un bloc imbriqué (décalé) | ⚠️ ligne présente, pas de dépôt « à l'intérieur » d'un bloc pour l'imbriquer | **P1** |
| Image « fantôme » du bloc qui suit la souris | ✅ (23/11) | |
| Sélectionner plusieurs blocs (cadre de sélection ou Maj+clic), puis les **glisser tous ensemble** | ✅ ajouté le 23/11 — ❓ à confirmer par Victor | **P1** |
| Alt + glisser = dupliquer au lieu de déplacer | ✅ | |
| Glisser un bloc vers une page de la barre latérale pour l'y envoyer | ✅ | |
| Glisser une image directement (sans ⋮⋮) | ✅ | |

## 2. Clavier : Entrée, Tab, Retour arrière

| Geste dans Notion | Form | Prio |
|---|---|---|
| Entrée : nouvelle ligne du même type (puce → puce, case → case) | ✅ (éditeur) | |
| Entrée sur une puce / case **vide** : redevient du texte normal (sort de la liste) | ❓ | **P1** |
| Entrée au **début** d'un bloc : insère une ligne vide au-dessus, le texte reste | ❓ | P1 |
| Entrée dans le titre de la page : descend dans le contenu | ✅ | |
| Maj+Entrée : retour à la ligne dans le même bloc | ✅ (éditeur) | |
| Tab / Maj+Tab : imbriquer sous le bloc du dessus / ressortir | ✅ | |
| Tab sur plusieurs blocs sélectionnés : tous décalés d'un coup | ✅ (23/11) | |
| Retour arrière au début d'une puce / case / titre : redevient texte (sans fusionner) ; 2ᵉ appui : fusionne avec le bloc du dessus | ❓ | **P1** |
| Retour arrière au début d'un bloc imbriqué : remonte d'un niveau d'abord | ❓ | P1 |
| Flèches haut/bas : passent d'un bloc à l'autre en gardant la colonne du curseur | ❓ | P2 |

## 3. Sélection de blocs

| Geste dans Notion | Form | Prio |
|---|---|---|
| Échap : sélectionne le bloc du curseur (fond bleu) ; Échap à nouveau : désélectionne | ✅ | |
| Flèches avec des blocs sélectionnés : changer de bloc ; Maj+flèches : étendre | ✅ | |
| Clic maintenu dans la marge puis glisser : cadre de sélection de plusieurs blocs | ✅ | |
| **Pendant le cadre de sélection, la page défile si on approche du bord (et la molette marche)** | ❓ | **P1** |
| Maj+clic : étendre jusqu'au bloc cliqué | ✅ | |
| Ctrl+A : texte du bloc, puis 2ᵉ appui : tous les blocs | ✅ | |
| Glisser la souris dans le texte d'un bloc vers un autre : la sélection passe en « blocs entiers » | ⚠️ sélection de texte classique | P2 |
| Retour arrière / Suppr sur la sélection : supprime | ✅ | |
| Ctrl+D : dupliquer · Ctrl+C / X / V : copier, couper, coller des blocs | ✅ | |
| Ctrl+Maj+↑/↓ : déplacer les blocs | ✅ | |
| Taper une lettre sur des blocs sélectionnés : remplace par ce texte | ⚠️ désélectionne seulement | P3 |
| Nombre de mots de la sélection affiché | ❌ | P3 |

## 4. Raccourcis de saisie (Markdown)

| Saisie dans Notion | Form | Prio |
|---|---|---|
| `- ` `* ` `+ ` puce · `1. ` numérotée · `[] ` case · `# ` `## ` `### ` titres | ✅ (éditeur) | |
| `> ` bloc déroulant · `" ` citation · `---` séparateur | ✅ | |
| `**gras**` `*italique*` `` `code` `` `~barré~` | ✅ | |
| `a. ` et `i. ` : liste numérotée en lettres / chiffres romains | ❌ | P3 |
| `:pomme` : choisir un émoji | ❓ | P2 |
| `[[` ou `+` : lier une page / créer une sous-page | ❌ | **P1** |
| `@` : mentionner une page | ✅ | |
| `@aujourd'hui`, `@demain`, `@lundi` : date · `@rappel` : rappel | ❓ | P2 |
| Coller une adresse sur du texte sélectionné : en fait un lien | ❓ | P2 |
| Coller une adresse seule : menu « Lien / Aperçu / Intégrer » | ✅ | |

## 5. Raccourcis clavier généraux

| Raccourci Notion | Form | Prio |
|---|---|---|
| Ctrl+Maj+0 à 8 : texte, titres, case, puce, numérotée, déroulant, code | ✅ | |
| Ctrl+Maj+9 : transformer la ligne en page | ✅ (23/11) | |
| **Ctrl+/ : menu « Transformer en / Couleur / Déplacer… » avec recherche, sur le bloc ou la sélection** | ✅ (23/11) | |
| Ctrl+Entrée : cocher, déplier, ouvrir | ✅ | |
| Ctrl+Alt+T : déplier / replier tous les déroulants | ✅ | |
| Ctrl+Maj+H : dernière couleur utilisée | ✅ | |
| Ctrl+K : lien sur le texte sélectionné (Form : Ctrl+K = recherche) | ⚠️ à arbitrer | P2 |
| Ctrl+P : recherche · Ctrl+F : chercher dans la page | ✅ | |
| Ctrl+[ / Ctrl+] : page précédente / suivante | ❓ | P2 |
| Ctrl+Maj+U : remonter à la page parente | ❌ | P3 |
| Ctrl+T / Ctrl+Maj+T : nouvel onglet / rouvrir le dernier fermé | ❓ | P2 |
| Ctrl+N : nouvelle page · Ctrl+Maj+L : thème clair/sombre | ❓ | P3 |
| Barre « / » : toutes les commandes (texte, page, puces, image, code, fichier, intégration, table des matières, bouton, fil d'Ariane, équation…) | ✅ | |
| `/rouge`, `/fond bleu` tapés dans un bloc | ✅ (23/11, à essayer au clavier) | |
| `/dupliquer`, `/déplacer`, `/supprimer` (et en anglais) | ✅ (23/11, à essayer au clavier) | |

## 6. Blocs et mise en page

| Fonction Notion | Form | Prio |
|---|---|---|
| Texte, titres 1-3, listes, cases, déroulants, citation, séparateur, encadré, code, équation, tableau simple, colonnes, table des matières, fil d'Ariane, bouton | ✅ | |
| Titres déroulants (titre qui se replie) | ✅ (Transformer en) | |
| Tableau simple : fusionner des cellules, Ctrl+R / Ctrl+D pour remplir | ❌ | P3 |
| Blocs synchronisés (même contenu sur plusieurs pages) | ❌ | P3 |
| Image : recadrer, aligner, légende, plein écran, remplacer | ⚠️ partiel | P2 |
| Largeur de page (pleine largeur), police (par défaut / serif / mono), petit texte | ❓ | P2 |
| Liens retour (« pages qui pointent ici ») | ⚠️ existe (plan de page) | P2 |
| Historique des versions d'une page (revenir à hier) | ❌ (table prévue, pas d'écran) | P2 |
| Commentaires | ❌ (utilisateur seul : P3) | P3 |
| Modèles : bouton « modèle » qui recopie des blocs | ✅ | |

**Ajouts tirés du document ChatGPT de Victor (23/11) — état dans Form à vérifier :**

| Fonction Notion | Form | Prio |
|---|---|---|
| Image : lien cliquable sur l'image, texte alternatif, télécharger, voir l'original | ❓ | P3 |
| Bloc code : choix du langage, bouton Copier, retour à la ligne automatique, légende | ❓ | P2 |
| Colonnes : glisser la séparation pour changer les largeurs ; une colonne vidée disparaît toute seule | ❓ | P2 |
| Tableau simple : ligne / colonne d'en-tête, ajuster à la largeur, « Transformer en base de données » | ❓ | P3 |
| Bloc « Lien vers une page » (sans déplacer la page) | ❓ | P2 |
| Icône de page : émoji, icône, image importée, **aléatoire** ; couverture : **repositionner** le cadrage | ❓ | P2 |
| Menu ••• de page : verrouiller la page, copier le lien (Ctrl+L), exporter, mode présentation | ❓ | P2 |
| Boutons : actions « insérer des blocs », « ajouter une page dans une base », « ouvrir une page / URL », « confirmation » | ⚠️ seulement insérer des blocs | P3 |
| Base : éditeur de disposition des pages (propriétés épinglées, panneau latéral) ; propriétés Lieu, Bouton, ID | ❌ | P3 |
| Collage d'une adresse : « coller en mention » en plus de lien / aperçu / intégration | ❌ | P3 |

## 7. Barre latérale et navigation

| Fonction Notion | Form | Prio |
|---|---|---|
| Pages imbriquées, glisser-déposer, favoris, corbeille | ✅ | |
| Survol d'une page : boutons « ··· » et « + » (sous-page) | ❓ | P2 |
| Raccourci vers une page / épingler une vue de base dans la barre | ❌ | P3 |
| Onglets, recherche Ctrl+K avec pages récentes | ✅ | |
| Fil d'Ariane en haut de page (cliquable) | ✅ | |

## 8. Bases de données

| Fonction Notion | Form | Prio |
|---|---|---|
| Vues tableau, liste, kanban, calendrier, galerie | ✅ | |
| Vue chronologie (timeline) | ❌ | P2 |
| Vues graphique, tableau de bord, carte, flux, formulaire | ❌ (tableau de bord à part) | P3 |
| Filtres, tris, groupes | ✅ | |
| Filtres avancés (ET / OU imbriqués) | ❓ | P2 |
| Propriétés texte, nombre, date, sélection, multi-sélection, case, URL, relation, fichier | ✅ | |
| Propriétés **formule**, **rollup**, personne, e-mail, téléphone, date de création/modification, ID unique, statut | ❌ | P2 (formule, statut) |
| Couleur conditionnelle | ❌ | P3 |
| Tableau : calculs en pied de colonne, colonne figée, retour à la ligne, modifier plusieurs lignes d'un coup | ❓ | P2 |
| Kanban : sous-groupes, taille des cartes, image sur les cartes, colonnes masquées | ❓ | P2 |
| Calendrier : vue semaine, glisser / étirer une carte, semaine commençant lundi | ❓ | P2 |
| Modèles de base (pages préremplies, modèles répétitifs) | ⚠️ modèles de pages | P2 |
| Sous-éléments et dépendances | ❌ | P3 |
| Boutons et automatisations de base | ❌ | P3 |

## 9. Import / export

| Fonction Notion | Form | Prio |
|---|---|---|
| Import Notion | ✅ | |
| Export d'une page en PDF / Markdown / HTML ; base en CSV | ❓ | P2 |
| Export complet | ✅ (« Exporter tout ») | |
| Web Clipper (enregistrer une page web) | ❌ | P3 |

---

## Hors sujet pour Form (pas prévu)
Partage et permissions, travail à plusieurs, Notion AI / agents, Notion Sites, Notion Calendar, application mobile, abonnements.

## Ordre conseillé
1. ~~Glisser maison des blocs~~ (fait le 23/11 : molette, défilement auto, aperçu, plusieurs blocs, Échap annule). Reste : dépôt « à l'intérieur » d'un bloc pour l'imbriquer, et le même défilement pendant le cadre de sélection.
2. **Entrée / Retour arrière / Tab** au comportement exact de Notion (vérifier chaque ❓ au vrai clavier, puis corriger).
3. **Ctrl+/** et **[[ / +** pour lier et créer des pages.
4. Le reste des P2, par petits lots.
