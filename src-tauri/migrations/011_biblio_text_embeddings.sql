-- Empreintes des descriptions de types (« un plat cuisiné »…) calculées par le modèle de texte : gardées pour ne pas les recalculer.
-- vec : 512 flottants 32 bits en base64, de longueur 1 (comme les empreintes d'images).

CREATE TABLE lib_text_embeddings (
  text  TEXT NOT NULL,
  model TEXT NOT NULL,
  dim   INTEGER NOT NULL,
  vec   TEXT NOT NULL,
  PRIMARY KEY (text, model)
);
