-- Fiches recettes : la recette remise au propre (ingrédients, étapes) d'après la description du post et le texte lu dans la vidéo.
-- `body` : JSON { portions, temps, ingredients: [{ titre?, lignes[] }], etapes[], notes?, post? }.
CREATE TABLE lib_recipes (
  block_id   TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
