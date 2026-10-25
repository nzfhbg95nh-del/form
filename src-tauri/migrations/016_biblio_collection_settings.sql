-- Réglages d'une collection : image de couverture choisie (un bloc) et ordre d'affichage des images
-- (vide ou « recent » : les plus récentes d'abord ; « oldest » : les plus anciennes d'abord ; « random » : mélangées à chaque ouverture).
ALTER TABLE lib_collections ADD COLUMN cover_block TEXT;
ALTER TABLE lib_collections ADD COLUMN sort_mode TEXT;
