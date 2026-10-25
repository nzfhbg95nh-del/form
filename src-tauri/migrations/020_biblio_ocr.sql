-- Texte lu dans les vidéos (recettes, astuces…) : quelques images de chaque vidéo passent dans la lecture de texte de Windows.
-- Une ligne par vidéo, même quand rien n'a été trouvé (texte vide), pour ne pas la relire à chaque fois.
CREATE TABLE lib_ocr (
  path_rel   TEXT PRIMARY KEY,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
