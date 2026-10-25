-- Bibliothèque : tout ce que Klippr sait des fichiers de Social Saver (qui restent en lecture seule, sur le disque).
-- Un « bloc » est une image, une vidéo ou un carrousel ; il a un ou plusieurs fichiers.

-- Les réglages de la bibliothèque (dossier de Social Saver, version du classement…) vont dans la table « settings » de Form, qui existe déjà.

CREATE TABLE lib_collections (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  -- instagram / pinterest : collections automatiques ; manual : les miennes
  kind        TEXT NOT NULL,
  owner       TEXT,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE TABLE lib_blocks (
  id           TEXT PRIMARY KEY,
  source       TEXT NOT NULL,
  owner        TEXT NOT NULL,
  board        TEXT,
  origin_id    TEXT NOT NULL,
  origin_url   TEXT,
  -- image / video / carousel
  kind         TEXT NOT NULL,
  published_at TEXT,
  imported_at  TEXT NOT NULL,
  -- ok / missing (tous les fichiers ont disparu du disque)
  status       TEXT NOT NULL DEFAULT 'ok',
  note         TEXT NOT NULL DEFAULT ''
);

CREATE TABLE lib_files (
  path_rel TEXT PRIMARY KEY,
  block_id TEXT NOT NULL REFERENCES lib_blocks(id),
  position INTEGER NOT NULL,
  kind     TEXT NOT NULL,
  size     INTEGER NOT NULL,
  mtime    INTEGER NOT NULL,
  width    INTEGER,
  height   INTEGER,
  duration REAL,
  thumb    TEXT,
  -- 0 à faire, 1 prête, -1 impossible à générer
  thumb_ok INTEGER NOT NULL DEFAULT 0,
  missing  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_lib_files_block ON lib_files(block_id);
CREATE INDEX idx_lib_files_thumb ON lib_files(thumb_ok, missing);

CREATE TABLE lib_block_collections (
  block_id      TEXT NOT NULL REFERENCES lib_blocks(id),
  collection_id TEXT NOT NULL REFERENCES lib_collections(id),
  PRIMARY KEY (block_id, collection_id)
);
CREATE INDEX idx_lib_bc_collection ON lib_block_collections(collection_id);

-- Connexions entre deux blocs (manuelles ou calculées), pour le graphe.
CREATE TABLE lib_links (
  id         TEXT PRIMARY KEY,
  block_a    TEXT NOT NULL REFERENCES lib_blocks(id),
  block_b    TEXT NOT NULL REFERENCES lib_blocks(id),
  kind       TEXT NOT NULL,
  reason     TEXT NOT NULL DEFAULT '',
  score      REAL,
  created_at TEXT NOT NULL
);
