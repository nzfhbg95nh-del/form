-- La carte : la position (x, y) de chaque image sur le plan, calculée d'après la ressemblance des images.
-- Les positions sont recalculables à tout moment (bouton dans la carte) ; les nouvelles images sont placées près de leurs voisines.
CREATE TABLE lib_map (
  block_id TEXT PRIMARY KEY,
  x        REAL NOT NULL,
  y        REAL NOT NULL
);
