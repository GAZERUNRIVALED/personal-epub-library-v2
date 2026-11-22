-- Metadata katalog (D1). Isi chapter & aset ada di R2: novels/{id}/ch/{n}.html, novels/{id}/asset/{nama}
CREATE TABLE novels (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  author        TEXT NOT NULL,
  synopsis      TEXT NOT NULL DEFAULT '',
  has_cover     INTEGER NOT NULL DEFAULT 0,
  chapter_count INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  rev           INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  published_at  INTEGER,
  updated_at    INTEGER NOT NULL
);
CREATE TABLE chapters (
  novel_id TEXT NOT NULL,
  n        INTEGER NOT NULL,
  title    TEXT NOT NULL,
  rev      INTEGER NOT NULL DEFAULT 0,
  size     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (novel_id, n)
) WITHOUT ROWID;
CREATE INDEX idx_novels_pub ON novels (status, published_at DESC);
