-- Sous-collections : une collection à moi peut être rangée dans une autre (par exemple « Graphic tee » dans le tableau « Art graphic »).
ALTER TABLE lib_collections ADD COLUMN parent_id TEXT;
CREATE INDEX idx_lib_collections_parent ON lib_collections(parent_id);
