-- Tags perso (la note perso d'un bloc est déjà dans lib_blocks.note).
-- key : version normalisée (minuscules, sans accents) ; name : tel que tapé la première fois.

CREATE TABLE lib_tags (
  key  TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE lib_block_tags (
  block_id TEXT NOT NULL REFERENCES lib_blocks(id),
  tag_key  TEXT NOT NULL REFERENCES lib_tags(key),
  PRIMARY KEY (block_id, tag_key)
);
CREATE INDEX idx_lib_bt_tag ON lib_block_tags(tag_key);
