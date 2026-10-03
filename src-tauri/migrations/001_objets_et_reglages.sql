CREATE TABLE objects (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL DEFAULT 'page',
  parent_id   TEXT REFERENCES objects(id),
  title       TEXT NOT NULL DEFAULT '',
  icon        TEXT,
  cover       TEXT,
  properties  TEXT NOT NULL DEFAULT '{}',
  content     TEXT,
  position    REAL NOT NULL DEFAULT 0,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX idx_objects_parent ON objects(parent_id);
CREATE INDEX idx_objects_deleted ON objects(deleted_at);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
