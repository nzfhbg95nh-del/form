-- Les photos HEIC avaient échoué (miniature « impossible ») : Klippr sait maintenant les lire grâce à Windows, on les retente.
UPDATE lib_files SET thumb_ok = 0 WHERE thumb_ok = -1 AND (lower(path_rel) LIKE '%.heic' OR lower(path_rel) LIKE '%.heif');
