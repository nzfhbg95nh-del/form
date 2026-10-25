-- Corbeille de Klippr. trashed_at : date de mise à la corbeille (vide = l'image est dans l'appli) ; l'image disparaît de partout
-- mais ses rangements sont gardés pour pouvoir la restaurer. Aucun fichier n'est touché à ce stade.
ALTER TABLE lib_blocks ADD COLUMN trashed_at TEXT;

-- Images supprimées définitivement (leur fichier est parti dans la Corbeille Windows) : Klippr ne les réimporte plus,
-- même si Social Saver remet un jour le même fichier.
CREATE TABLE lib_forgotten (
  block_id   TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL
);
