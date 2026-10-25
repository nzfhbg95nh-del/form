-- Moodboards : une toile libre où l'on pose des images de la bibliothèque (référencées, jamais copiées), des notes, des couleurs, des liens.
-- content : le plan de la toile en JSON (éléments, position, zoom, fond). collection_id : le tableau d'où il est parti, s'il y en a un.

CREATE TABLE lib_moodboards (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '',
  collection_id TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
