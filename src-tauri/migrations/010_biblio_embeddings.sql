-- Empreintes d'images calculées par l'IA locale (CLIP) : 512 nombres par fichier, déjà ramenés à la longueur 1.
-- vec : les nombres en flottants 32 bits, encodés en base64. Servent à classer par type et à chercher les images proches.

CREATE TABLE lib_embeddings (
  path_rel   TEXT PRIMARY KEY REFERENCES lib_files(path_rel),
  model      TEXT NOT NULL,
  dim        INTEGER NOT NULL,
  vec        TEXT NOT NULL,
  created_at TEXT NOT NULL
);
