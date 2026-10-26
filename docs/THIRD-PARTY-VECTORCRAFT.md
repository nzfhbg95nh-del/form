# VectorCraft

Les outils de dessin vectoriel du moodboard de Form (plume, flèche blanche, ajout/suppression/conversion de point, crayon,
lisseur, gomme de tracé, jonction…) sont ceux de **VectorCraft** — https://github.com/storytold/vectorcraft —, utilisés tels quels
comme bibliothèque Rust (moteur `vectorcraft-engine`, version figée par son numéro de commit dans `src-tauri/Cargo.toml`).

Copyright (c) 2026 ArtCraft Team and the VectorCraft contributors.
Licence : MIT ou Apache-2.0, au choix (le texte MIT est dans `docs/LICENSE-VECTORCRAFT-MIT.txt`).
Le nom, le logo et les images « ArtCraft » sont des marques qui ne sont pas couvertes par cette licence : Form n'en utilise aucune.

Dans Form, seul le fichier `src-tauri/src/vector.rs` (la « colle ») et `src/lib/vectorEngine.ts` / `src/components/VectorOverlay.tsx`
sont écrits par nous : ils envoient au moteur les tracés du moodboard et les gestes de la souris, puis dessinent ce qu'il répond.
