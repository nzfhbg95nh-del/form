# Form

Form est un logiciel Windows pour un créatif freelance : des pages façon Notion, la facturation d'une micro-entreprise, des moodboards et une bibliothèque d'images. Tout est local : pas de serveur, pas de compte.

## Installer
Télécharger l'installateur (`.msi`) de la dernière version dans les [Releases](https://github.com/nzfhbg95nh-del/form-releases/releases). La suite des mises à jour se fait depuis l'application.

## Ce qu'il y a dans le dépôt
| Dossier | Contenu |
| --- | --- |
| `src/` | L'interface (React + TypeScript) : pages, bases de données, moodboards, facturation, bibliothèque |
| `src-tauri/` | La partie Windows (Rust, Tauri 2) : base SQLite, fichiers, IA locale, sauvegardes |
| `e2e/` | Tests de bout en bout (Playwright dans Microsoft Edge) |
| `docs/` | Journal de travail (`JOURNAL.md`), audit (`audit/`), notes techniques |
| `scripts/` | Petits outils de développement |
| `.github/workflows/` | Fabrication des installateurs (`release.yml` pour les versions `v*`, `beta.yml` pour les bêtas) |

Le cahier des charges est dans `CLAUDE.md`.

## Pour développer
Prérequis : Node.js, Rust, et les outils Windows de Tauri.

```bash
npm install
npm test            # tests automatiques (vitest)
npm run e2e         # tests de bout en bout (Edge, rien à télécharger)
npm run lint        # lecteur de code
npm run build       # compilation + fabrication de l'interface
```

Lancer l'application complète en développement : `scripts/travail-en-direct.ps1`.

## Publier une version
1. Fusionner la branche de travail dans `main`.
2. Mettre le numéro de version à jour dans `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` et `src-tauri/Cargo.lock`.
3. Poser l'étiquette `vX.Y.Z` et l'envoyer : GitHub fabrique l'installateur et le publie (environ 25 minutes).

Les secrets de fabrication (clé de signature des mises à jour, jeton de publication) sont dans les réglages du dépôt GitHub. La clé privée locale (`.cle-mise-a-jour/`) n'est jamais envoyée.
