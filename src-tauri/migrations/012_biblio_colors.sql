-- Couleurs dominantes de chaque image, calculées en arrière-plan à partir des miniatures.
-- colors : jusqu'à 5 couleurs, de la plus présente à la moins présente, « rrggbb:part en % » séparées par des virgules
-- (vide quand l'image est presque toute blanche ou noire : on ne la recalcule pas).

CREATE TABLE lib_colors (
  path_rel   TEXT PRIMARY KEY REFERENCES lib_files(path_rel),
  colors     TEXT NOT NULL,
  created_at TEXT NOT NULL
);
