# Brief — « Bibliothèque » : mes enregistrements Instagram + Pinterest dans Form (façon Pinterest × Are.na)

> À lire en entier avant toute action, avec `CLAUDE.md`. Les règles de travail de `CLAUDE.md` s'appliquent ici aussi : je parle français, je ne code pas, petits pas, plan de 5 à 10 lignes avant chaque phase, attendre mon accord, tenir `docs/JOURNAL.md`, tests automatiques sur la logique.

## 1. L'idée

J'ai ~17 600 images et vidéos sauvegardées sur Instagram et Pinterest, téléchargées sur mon PC par **Social Saver**. Je veux pouvoir les **regarder, trier, relier et réutiliser** dans Form, avec l'ergonomie de **Pinterest** (grille infinie, découverte, similaires) et d'**Are.na** (blocs, channels, connexions, sobriété).

**Choix recommandé : un nouveau module « Bibliothèque » dans Form**, pas une appli séparée. Raisons : Form a déjà la stack, le style, la base SQLite, la sauvegarde, la mise à jour automatique, et surtout **le moodboard** (toile, palette, fenêtre flottante façon PureRef) — que je veux pouvoir alimenter directement depuis la bibliothèque. Si tu vois un blocage sérieux (performances avec 17 000 fichiers, taille de la base…), dis-le-moi avant de commencer.

## 2. Les données de Social Saver (ce que j'ai constaté)

Dossier : `C:\Users\noesa\Desktop\Social Saver\Save images` (le chemin doit être réglable dans Réglages, il peut changer).

```
Save images\
  _archive.sqlite3                          ← mémoire de Social Saver (seulement des identifiants). NE PAS TOUCHER.
  instagram\<compte_auteur>\<AAAAMMJJ>_<code>_<NN>.<ext>     ← ~1 580 comptes, ~9 300 fichiers
  pinterest\<propriétaire>\<nom_du_tableau>\<id_du_pin>.<ext> ← ~7 750 fichiers
```

- **Instagram** : le dossier = l'auteur du post. Nom de fichier = date de publication + code du post + numéro dans le carrousel. Le code permet probablement de reconstruire le lien (`https://www.instagram.com/p/<code>/`) — à vérifier. Les fichiers d'un même carrousel doivent être regroupés en un seul bloc (avec navigation entre les images), à vérifier sur les noms.
- **Pinterest** : `DYSARTADD` = mon compte, avec mes tableaux (`3D & CGI`, `Product design & objects`, `Projects (ATTO ALTO)`, `Tattoo`…). Les autres dossiers (`evahecquet`, `sachagiorgetti`…) sont des tableaux d'autres personnes que je suis/ai sauvegardés. Nom de fichier = id du pin → lien `https://www.pinterest.com/pin/<id>/`.
- **Formats** : jpg (~13 000), png (~1 900), **mp4 (~1 600)**, webp, gif, quelques **heic** et m4v, 2 mp3. Il faut gérer les vidéos et les HEIC (conversion en miniature).
- **Pas de fichier de métadonnées** (pas de légende, pas de JSON) : tout vient de l'arborescence et des noms de fichiers.

**Règles impératives :**
- **Lecture seule** sur `Save images` : ne jamais déplacer, renommer, modifier ni supprimer un fichier. Les données de la bibliothèque (collections, tags, notes, liens) vivent dans la base de Form.
- **Ne pas copier** les 17 000 fichiers : on les référence par leur chemin. On génère seulement des **miniatures** (cache dans le dossier de données de Form).
- **Import incrémental** : un bouton « Mettre à jour la bibliothèque » (+ détection au démarrage) ajoute les nouveaux fichiers sans doublons. Un fichier disparu (j'utilise *NoMoreDuplicates*, qui met les doublons à la corbeille) est marqué « introuvable », sans casser mes collections.
- Identifiant stable d'un bloc : source + id (code Instagram + n°, ou id du pin), pas le chemin seul.

## 3. Modèle de données (inspiré d'Are.na)

- **Bloc** : un élément (image, vidéo ou carrousel). Champs : source (instagram / pinterest / import manuel), auteur ou tableau d'origine, id d'origine, lien d'origine, chemin(s) du fichier, type, date de publication (Instagram) et date d'import, dimensions, durée (vidéo), couleurs dominantes, tags, note perso, état (ok / introuvable).
- **Collection** (= *channel* Are.na) : un bloc peut être dans **plusieurs** collections. Les tableaux Pinterest et les auteurs Instagram d'origine sont des **collections automatiques** ; je peux créer les miennes.
- **Connexion** entre deux blocs : manuelle (je relie) ou calculée (voir page 4), avec la raison du lien.
- Données « lourdes » calculées en arrière-plan, sans bloquer l'interface : miniatures, couleurs, embeddings d'images.

## 4. Les pages

Style : celui de Form (variables `--bg`, `--fg`, `--fg-muted`, `--border`, `--accent`, Segoe UI, thème clair/sombre, sobriété façon Notion). Mise en page de la grille : Pinterest. Pages de détail et collections : Are.na (beaucoup de blanc, typo, peu de décor). Une entrée « Bibliothèque » dans la barre latérale.

### Page 1 — Tout (la grille)
- Grille **masonry** façon Pinterest, toutes sources confondues, triée par date (plus récent d'abord).
- **Virtualisation** obligatoire : fluide avec 17 000 éléments. Miniatures générées en local.
- **Vidéos** : lecture muette au survol, son au clic, petite icône « vidéo » et durée. Carrousels : petite icône « plusieurs images ».
- Barre de recherche + filtres : source, auteur/tableau, collection, tag, **couleur**, type (image / vidéo), date.
- Curseur de taille des vignettes ; mode « plein écran » minimal.
- Clic → **vue détail** : grand format (navigation ← → et dans le carrousel), source et lien d'origine (bouton « Ouvrir sur Instagram/Pinterest »), collections où il apparaît, note perso, tags, palette (copie HEX), connexions, et **« Similaires »** en dessous (comme Pinterest).
- « Ouvrir dans l'Explorateur Windows » pour retrouver le fichier.

### Page 2 — Mes enregistrements / Collections
- Toutes les collections en cartes (aperçu de quelques images + nombre de blocs), sections : **Mes collections**, **Tableaux Pinterest**, **Comptes Instagram** (triés par nombre d'enregistrements).
- Vue d'une collection : grille (et option liste façon Are.na), description, blocs.
- **Tri rapide** : sélection multiple (rectangle, Maj/Ctrl+clic), glisser-déposer vers une collection, raccourcis clavier, menu clic droit « Ajouter à… ».
- **File « À trier »** : les blocs dans aucune de mes collections, avec un mode tri rapide (une image à la fois, une touche = une collection).

### Page 3 — Moodboard (réutiliser celui de Form)
- **Réutiliser le moodboard existant** (`src/components/MoodboardView.tsx`, `src/lib/moodboard.ts`) — ne pas en recoder un.
- Depuis la bibliothèque : **glisser des blocs vers un moodboard**, ou « Envoyer la sélection vers un moodboard… » (existant ou nouveau). Depuis une collection : « Créer un moodboard avec cette collection » (disposition automatique avec « Organiser »).
- Une image posée sur le moodboard garde le **lien vers son bloc** (clic droit → « Voir dans la bibliothèque ») ; ajouter au moodboard le support des **vidéos** si c'est raisonnable.
- Le moodboard doit pouvoir s'ouvrir aussi depuis la Bibliothèque (panneau ou onglet), et marcher dans la **fenêtre flottante** existante.
- Faire attention à ne pas dupliquer les fichiers : si le moodboard copie aujourd'hui les images dans `board_assets`, proposer une façon de **référencer** le fichier de Social Saver à la place.

### Page 4 — Graphe des liaisons
- Toile comme sur ma capture de référence : les images en **vignettes** reliées par des lignes fines, avec un petit label sur chaque lien (« même tableau », « même auteur », « couleurs proches », « similaire 0,87 », « lien manuel »).
- Liens calculés : même collection, même tag, même auteur, couleurs proches, **similarité visuelle** (embeddings d'images calculés **en local**, modèle type CLIP sur ma carte graphique RTX 4070 — rien de payant, rien dans le cloud), + mes liens manuels.
- Disposition en graphe de forces, zoom/pan fluide (rendu WebGL/canvas, pas des milliers d'éléments DOM). On part d'une sélection, d'une collection ou d'une image et on explore ses voisins (clic = centrer + afficher les voisins), avec filtres par type de lien et seuil de similarité. Pas besoin d'afficher les 17 000 d'un coup.
- Depuis le graphe : envoyer un groupe d'images vers un moodboard ou une collection.

## 5. Fonctionnalités en plus (après les 4 pages, à me proposer une par une)
- **Recherche par texte libre** via les embeddings (« chaise en métal brossé », « lumière rasante ») et **recherche par image** (je dépose une capture → les plus proches).
- **Filtre par couleur** (pipette) et palette d'une sélection.
- **Auto-tags locaux** (objet, matière, style) — en local, ou Gemini seulement sur bouton, comme dans le reste de Form.
- **Mode redécouverte** : fil aléatoire / « il y a un an » pour ressortir des images oubliées.
- **Doublons** (même image sauvée sur Instagram et Pinterest) : les signaler, sans rien supprimer.
- **Mode présentation** : diaporama plein écran d'une collection ou d'un moodboard.
- **Export d'une planche** (PNG/PDF) depuis une sélection ou un moodboard, pour un client.
- **Lien avec les pages de Form** : intégrer une collection dans une page projet (bloc « Collection »).
- **Statistiques** : couleurs, auteurs, tableaux et tags les plus présents.
- Ajouter une image à la main (glisser-déposer depuis le bureau ou le navigateur, coller).

## 6. Ordre de travail proposé
1. Lire Form (en particulier le moodboard, la base, le style) et parcourir `Save images`. Me présenter le plan.
2. **Indexation** : réglage du dossier, scan incrémental, miniatures en arrière-plan, tests sur le découpage des noms de fichiers.
3. **Page Tout** + vue détail.
4. **Collections** + « À trier » + tri rapide.
5. **Moodboard** relié à la bibliothèque.
6. **Similarité** (embeddings locaux) → « Similaires » dans la vue détail.
7. **Graphe des liaisons.**
8. Les bonus, un par un.

À chaque étape : ce qui a été fait, comment le tester (clics précis), ce qui vient ensuite — et une nouvelle version publiée comme d'habitude.
