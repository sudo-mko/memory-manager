/**
 * SQLite schema for the Sift index.
 *
 * The index is the heart of the app: every photo the user owns is described by
 * one row in `photos`, and everything the UI does (browse, search, filter,
 * dedupe, stats) is a query against that table. Tags and collections are stored
 * relationally; `search_blob` is a denormalised lowercase haystack kept in sync
 * on every write so free-text search stays a single indexed scan.
 */

/** Bumped whenever the statements below change shape. */
export const SCHEMA_VERSION = 2;

export const CREATE_TABLES = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS photos (
  id           TEXT PRIMARY KEY NOT NULL,
  uri          TEXT NOT NULL,
  filename     TEXT NOT NULL,
  media_type   TEXT NOT NULL DEFAULT 'photo',
  width        INTEGER NOT NULL DEFAULT 0,
  height       INTEGER NOT NULL DEFAULT 0,
  duration     REAL    NOT NULL DEFAULT 0,
  file_size    INTEGER,
  created_at   INTEGER NOT NULL DEFAULT 0,
  modified_at  INTEGER NOT NULL DEFAULT 0,
  album_name   TEXT,
  source       TEXT NOT NULL DEFAULT 'device',
  auto_tags    TEXT NOT NULL DEFAULT '',
  user_tags    TEXT NOT NULL DEFAULT '',
  ocr_text     TEXT,
  phash        TEXT,
  favorite     INTEGER NOT NULL DEFAULT 0,
  archived     INTEGER NOT NULL DEFAULT 0,
  note         TEXT,
  search_blob  TEXT NOT NULL DEFAULT '',
  indexed_at   INTEGER NOT NULL DEFAULT 0,
  -- CLIP ViT-B/32 image embedding: 512 float32 values stored as a raw BLOB.
  embedding    BLOB,
  embedded_at  INTEGER,
  -- Tags recognised visually by CLIP, kept apart from the metadata-derived
  -- auto_tags so a re-scan can refresh one without discarding the other.
  visual_tags  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS photo_tags (
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (photo_id, tag_id)
);

CREATE TABLE IF NOT EXISTS collections (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  icon       TEXT NOT NULL DEFAULT 'albums-outline',
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS collection_photos (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  photo_id      TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  added_at      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, photo_id)
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  query      TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recent_searches (
  query    TEXT PRIMARY KEY NOT NULL,
  used_at  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT
);
`

/**
 * Indexes are created after migrations run, because some of them reference
 * columns that an older database only gains during the upgrade.
 */
export const CREATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_photos_created   ON photos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_favorite  ON photos (favorite);
CREATE INDEX IF NOT EXISTS idx_photos_album     ON photos (album_name);
CREATE INDEX IF NOT EXISTS idx_photos_phash     ON photos (phash);
CREATE INDEX IF NOT EXISTS idx_photos_archived  ON photos (archived);
CREATE INDEX IF NOT EXISTS idx_photos_embedded  ON photos (embedded_at);
CREATE INDEX IF NOT EXISTS idx_photo_tags_tag ON photo_tags (tag_id);
`;

/**
 * Statements applied to an existing database when upgrading from an earlier
 * schema version. Keyed by the version they upgrade *to*. A fresh install gets
 * the full schema above and skips these entirely.
 */
export const MIGRATIONS: Record<number, string[]> = {
  2: [
    'ALTER TABLE photos ADD COLUMN embedding BLOB',
    'ALTER TABLE photos ADD COLUMN embedded_at INTEGER',
    "ALTER TABLE photos ADD COLUMN visual_tags TEXT NOT NULL DEFAULT ''",
  ],
};
