-- Types d'image (art graphic, typo, brand identity…) : un tri global, distinct des tags.
-- id : version normalisée du nom (minuscules, sans accents) ; name : le nom affiché.

CREATE TABLE lib_types (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Règle « toute image de ce tableau reçoit ce type ».
CREATE TABLE lib_type_boards (
  type_id       TEXT NOT NULL REFERENCES lib_types(id),
  collection_id TEXT NOT NULL REFERENCES lib_collections(id),
  PRIMARY KEY (type_id, collection_id)
);

-- origin : board (règle d'un tableau), manual (moi), ai (proposition de l'IA, à confirmer),
-- removed (retiré par moi : la règle du tableau ne le remet pas).
CREATE TABLE lib_block_types (
  block_id TEXT NOT NULL REFERENCES lib_blocks(id),
  type_id  TEXT NOT NULL REFERENCES lib_types(id),
  origin   TEXT NOT NULL,
  score    REAL,
  PRIMARY KEY (block_id, type_id)
);
CREATE INDEX idx_lib_bty_type ON lib_block_types(type_id);
