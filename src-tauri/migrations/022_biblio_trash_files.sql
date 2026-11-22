-- Corbeille pour une seule image d'un carrousel : sa ligne quitte lib_files (elle disparaît donc de partout dans Form)
-- et attend ici, avec les mêmes colonnes, qu'on la restaure ou qu'on la supprime définitivement.
CREATE TABLE lib_trashed_files (
  path_rel   TEXT PRIMARY KEY,
  block_id   TEXT NOT NULL,
  position   INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  mtime      INTEGER NOT NULL,
  width      INTEGER,
  height     INTEGER,
  duration   REAL,
  thumb      TEXT,
  thumb_ok   INTEGER NOT NULL DEFAULT 0,
  missing    INTEGER NOT NULL DEFAULT 0,
  trashed_at TEXT NOT NULL
);
CREATE INDEX idx_lib_trashed_files_block ON lib_trashed_files(block_id);

-- Images de carrousel supprimées définitivement : Form ne les réimporte plus, même si le fichier revient (nouveau téléchargement).
CREATE TABLE lib_forgotten_files (
  path_rel   TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL
);
