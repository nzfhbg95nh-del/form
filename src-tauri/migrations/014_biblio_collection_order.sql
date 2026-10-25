-- Ordre choisi à la main pour les collections (glisser-déposer) : 0, 1, 2… parmi celles de même parent ; vide = ordre par défaut (par nom).
ALTER TABLE lib_collections ADD COLUMN position INTEGER;
