-- Images des moodboards. Le plan de la toile (positions, tailles, notes) est dans objects.content ;
-- les images sont ici, pour que chaque modification de la toile n'ait pas à réécrire des mégaoctets.
-- data_url : image réduite (2400 px max) ; thumb_url : miniature (512 px max) utilisée quand on dézoome.

CREATE TABLE board_assets (
  board_id    TEXT NOT NULL,
  id          TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  data_url    TEXT NOT NULL,
  thumb_url   TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (board_id, id)
);
