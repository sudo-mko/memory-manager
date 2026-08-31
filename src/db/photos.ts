/**
 * All reads and writes against the `photos` table, including the translation
 * from a `ParsedQuery` into SQL. Keeping the SQL in one place means the search
 * screen, collections and the duplicate finder all share the same semantics.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import { normaliseTag, parseTagList } from '@/lib/format';
import type { Comparison, IsFlag, ParsedQuery } from '@/lib/query-parser';
import { bytesToEmbedding, embeddingToBytes } from '@/lib/vector';

import { getDatabase } from './database';

/** One row of the index, as the UI consumes it. */
export type Photo = {
  id: string;
  uri: string;
  filename: string;
  mediaType: 'photo' | 'video';
  width: number;
  height: number;
  duration: number;
  fileSize: number | null;
  createdAt: number;
  modifiedAt: number;
  albumName: string | null;
  source: 'device' | 'demo' | 'imported';
  autoTags: string[];
  userTags: string[];
  ocrText: string | null;
  phash: string | null;
  /** Tags CLIP recognised in the picture itself. */
  visualTags: string[];
  /** Whether this photo has been through the CLIP image encoder. */
  hasEmbedding: boolean;
  embeddedAt: number | null;
  favorite: boolean;
  archived: boolean;
  note: string | null;
  indexedAt: number;
};

/** Shape of an asset handed to the indexer before it becomes a `Photo`. */
export type PhotoInput = {
  id: string;
  uri: string;
  filename: string;
  mediaType: 'photo' | 'video';
  width: number;
  height: number;
  duration?: number;
  fileSize?: number | null;
  createdAt: number;
  modifiedAt?: number;
  albumName?: string | null;
  source?: Photo['source'];
  autoTags: string[];
};

type PhotoRow = {
  id: string;
  uri: string;
  filename: string;
  media_type: string;
  width: number;
  height: number;
  duration: number;
  file_size: number | null;
  created_at: number;
  modified_at: number;
  album_name: string | null;
  source: string;
  auto_tags: string;
  user_tags: string;
  ocr_text: string | null;
  phash: string | null;
  visual_tags: string | null;
  embedded_at: number | null;
  favorite: number;
  archived: number;
  note: string | null;
  indexed_at: number;
};


/**
 * Every photo column except `embedding`.
 *
 * The 2 KB vector is deliberately left out of list queries — pulling it for a
 * grid of several thousand photos would move megabytes for data the grid never
 * uses. Embeddings are read on demand through `getEmbedding` and
 * `loadEmbeddingsForQuery` instead.
 */
const PHOTO_COLUMNS = `
  id, uri, filename, media_type, width, height, duration, file_size,
  created_at, modified_at, album_name, source, auto_tags, user_tags,
  ocr_text, phash, visual_tags, embedded_at, favorite, archived, note, indexed_at
`;

export type SortOrder = 'newest' | 'oldest' | 'largest' | 'name';

/** Values SQLite accepts as bound parameters. */
type BindValue = string | number | null;

const ORDER_BY: Record<SortOrder, string> = {
  newest: 'created_at DESC, filename ASC',
  oldest: 'created_at ASC, filename ASC',
  largest: '(width * height) DESC, created_at DESC',
  name: 'filename COLLATE NOCASE ASC',
};

function mapRow(row: PhotoRow): Photo {
  return {
    id: row.id,
    uri: row.uri,
    filename: row.filename,
    mediaType: row.media_type === 'video' ? 'video' : 'photo',
    width: row.width,
    height: row.height,
    duration: row.duration,
    fileSize: row.file_size,
    createdAt: row.created_at,
    modifiedAt: row.modified_at,
    albumName: row.album_name,
    source: (row.source as Photo['source']) ?? 'device',
    autoTags: parseTagList(row.auto_tags),
    userTags: parseTagList(row.user_tags),
    ocrText: row.ocr_text,
    phash: row.phash,
    visualTags: parseTagList(row.visual_tags),
    hasEmbedding: row.embedded_at != null,
    embeddedAt: row.embedded_at,
    favorite: row.favorite === 1,
    archived: row.archived === 1,
    note: row.note,
    indexedAt: row.indexed_at,
  };
}

/** Builds the lowercase haystack that free-text search scans. */
function buildSearchBlob(parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_\-./\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** SQL fragment for a numeric comparison, with the operator whitelisted. */
function comparisonSql(column: string, cmp: Comparison, params: BindValue[]): string {
  const op = ['>', '<', '>=', '<=', '='].includes(cmp.op) ? cmp.op : '=';
  params.push(cmp.value);
  return `${column} ${op} ?`;
}

function flagSql(flag: IsFlag): string {
  switch (flag) {
    case 'screenshot':
      return `auto_tags LIKE '%screenshot%'`;
    case 'selfie':
      return `auto_tags LIKE '%selfie%'`;
    case 'edited':
      return `auto_tags LIKE '%edited%'`;
    case 'video':
      return `media_type = 'video'`;
    case 'photo':
      return `media_type = 'photo'`;
    case 'favorite':
      return `favorite = 1`;
    case 'untagged':
      return `user_tags = ''`;
    case 'large':
      return `(width * height) >= 8000000`;
    case 'panorama':
      return `(height > 0 AND width >= height * 2)`;
    case 'square':
      return `(height > 0 AND ABS(CAST(width AS REAL) / height - 1.0) < 0.03)`;
    case 'portrait':
      return `height > width`;
    case 'landscape':
      return `width > height`;
    case 'text':
      return `(ocr_text IS NOT NULL AND ocr_text != '')`;
    case 'encoded':
      return `embedding IS NOT NULL`;
    default:
      return '1 = 1';
  }
}

/**
 * Translates a parsed query into a `WHERE` clause plus bound parameters.
 * Exported so the duplicate finder and collections can reuse it.
 */
export function buildWhereClause(query: ParsedQuery, includeArchived = false): {
  sql: string;
  params: BindValue[];
} {
  const clauses: string[] = [];
  const params: BindValue[] = [];

  if (!includeArchived) clauses.push('archived = 0');

  for (const term of query.terms) {
    clauses.push('search_blob LIKE ?');
    params.push(`%${term}%`);
  }
  for (const term of query.excluded) {
    clauses.push('search_blob NOT LIKE ?');
    params.push(`%${term}%`);
  }
  for (const tag of query.tags) {
    clauses.push(
      `(',' || user_tags || ',') LIKE ? OR (',' || auto_tags || ',') LIKE ? OR (',' || visual_tags || ',') LIKE ?`
    );
    params.push(`%,${tag},%`, `%,${tag},%`, `%,${tag},%`);
  }
  for (const tag of query.excludedTags) {
    clauses.push(
      `(',' || user_tags || ',') NOT LIKE ? AND (',' || auto_tags || ',') NOT LIKE ? AND (',' || visual_tags || ',') NOT LIKE ?`
    );
    params.push(`%,${tag},%`, `%,${tag},%`, `%,${tag},%`);
  }
  if (query.albums.length) {
    clauses.push(`(${query.albums.map(() => 'LOWER(album_name) = ?').join(' OR ')})`);
    params.push(...query.albums);
  }
  for (const flag of query.flags) clauses.push(flagSql(flag));
  for (const flag of query.excludedFlags) clauses.push(`NOT (${flagSql(flag)})`);

  if (query.after !== undefined) {
    clauses.push('created_at >= ?');
    params.push(query.after);
  }
  if (query.before !== undefined) {
    clauses.push('created_at < ?');
    params.push(query.before);
  }
  if (query.width) clauses.push(comparisonSql('width', query.width, params));
  if (query.height) clauses.push(comparisonSql('height', query.height, params));
  if (query.size) clauses.push(comparisonSql('COALESCE(file_size, 0)', query.size, params));

  return {
    sql: clauses.length ? `WHERE ${clauses.map((c) => `(${c})`).join(' AND ')}` : '',
    params,
  };
}

/** Runs a parsed query and returns matching photos. */
export async function searchPhotos(
  query: ParsedQuery,
  options: { sort?: SortOrder; limit?: number; offset?: number } = {}
): Promise<Photo[]> {
  const db = await getDatabase();
  const { sql, params } = buildWhereClause(query);
  const order = ORDER_BY[options.sort ?? 'newest'];
  const rows = await db.getAllAsync<PhotoRow>(
    `SELECT ${PHOTO_COLUMNS} FROM photos ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    ...params,
    options.limit ?? 500,
    options.offset ?? 0
  );
  return rows.map(mapRow);
}

/** Count only — used for result headers without paying for the rows. */
export async function countPhotos(query: ParsedQuery): Promise<number> {
  const db = await getDatabase();
  const { sql, params } = buildWhereClause(query);
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM photos ${sql}`,
    ...params
  );
  return row?.total ?? 0;
}

export async function getPhoto(id: string): Promise<Photo | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<PhotoRow>(`SELECT ${PHOTO_COLUMNS} FROM photos WHERE id = ?`, id);
  return row ? mapRow(row) : null;
}

export async function getPhotosByIds(ids: string[]): Promise<Photo[]> {
  if (!ids.length) return [];
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.getAllAsync<PhotoRow>(
    `SELECT ${PHOTO_COLUMNS} FROM photos WHERE id IN (${placeholders}) ORDER BY created_at DESC`,
    ...ids
  );
  return rows.map(mapRow);
}

/**
 * Inserts or refreshes a batch of assets in a single transaction.
 * User-owned columns (tags, notes, favourite) are preserved on conflict so a
 * re-scan never destroys the user's own work.
 */
export async function upsertPhotos(inputs: PhotoInput[]): Promise<number> {
  if (!inputs.length) return 0;
  const db = await getDatabase();
  const now = Date.now();
  let written = 0;

  await db.withTransactionAsync(async () => {
    for (const input of inputs) {
      const autoTags = input.autoTags.join(',');
      const blob = buildSearchBlob([input.filename, input.albumName, autoTags]);
      await db.runAsync(
        `INSERT INTO photos (
           id, uri, filename, media_type, width, height, duration, file_size,
           created_at, modified_at, album_name, source, auto_tags, search_blob, indexed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           uri = excluded.uri,
           filename = excluded.filename,
           media_type = excluded.media_type,
           width = excluded.width,
           height = excluded.height,
           duration = excluded.duration,
           file_size = COALESCE(excluded.file_size, photos.file_size),
           created_at = excluded.created_at,
           modified_at = excluded.modified_at,
           album_name = excluded.album_name,
           auto_tags = excluded.auto_tags,
           search_blob = excluded.search_blob || ' ' || photos.user_tags ||
                         ' ' || COALESCE(photos.ocr_text, '') || ' ' || COALESCE(photos.note, ''),
           indexed_at = excluded.indexed_at`,
        input.id,
        input.uri,
        input.filename,
        input.mediaType,
        Math.round(input.width) || 0,
        Math.round(input.height) || 0,
        input.duration ?? 0,
        input.fileSize ?? null,
        Math.round(input.createdAt) || 0,
        Math.round(input.modifiedAt ?? input.createdAt) || 0,
        input.albumName ?? null,
        input.source ?? 'device',
        autoTags,
        blob,
        now
      );
      written += 1;
    }
  });

  return written;
}

/** Recomputes `search_blob` for one photo after its tags/note/OCR changed. */
async function refreshSearchBlob(db: SQLiteDatabase, photoId: string): Promise<void> {
  const row = await db.getFirstAsync<PhotoRow>(`SELECT ${PHOTO_COLUMNS} FROM photos WHERE id = ?`, photoId);
  if (!row) return;
  const blob = buildSearchBlob([
    row.filename,
    row.album_name,
    row.auto_tags,
    row.user_tags,
    row.visual_tags,
    row.ocr_text,
    row.note,
  ]);
  await db.runAsync('UPDATE photos SET search_blob = ? WHERE id = ?', blob, photoId);
}

export async function setFavorite(photoId: string, favorite: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE photos SET favorite = ? WHERE id = ?', favorite ? 1 : 0, photoId);
}

export async function setArchived(photoId: string, archived: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE photos SET archived = ? WHERE id = ?', archived ? 1 : 0, photoId);
}

export async function setNote(photoId: string, note: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE photos SET note = ? WHERE id = ?', note.trim() || null, photoId);
  await refreshSearchBlob(db, photoId);
}

export async function setOcrText(photoId: string, text: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE photos SET ocr_text = ? WHERE id = ?', text.trim() || null, photoId);
  await refreshSearchBlob(db, photoId);
}

export async function setPerceptualHash(photoId: string, hash: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE photos SET phash = ? WHERE id = ?', hash, photoId);
}

export async function setFileSize(photoId: string, size: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE photos SET file_size = ? WHERE id = ?', size, photoId);
}

/** Adds a tag to a photo, creating the tag if it is new. Returns the clean tag. */
export async function addTag(photoId: string, rawTag: string): Promise<string | null> {
  const tag = normaliseTag(rawTag);
  if (!tag) return null;
  const db = await getDatabase();

  await db.runAsync(
    'INSERT INTO tags (name, created_at) VALUES (?, ?) ON CONFLICT(name) DO NOTHING',
    tag,
    Date.now()
  );
  const tagRow = await db.getFirstAsync<{ id: number }>('SELECT id FROM tags WHERE name = ?', tag);
  if (!tagRow) return null;

  await db.runAsync(
    'INSERT INTO photo_tags (photo_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
    photoId,
    tagRow.id
  );
  await syncUserTags(db, photoId);
  return tag;
}

export async function removeTag(photoId: string, rawTag: string): Promise<void> {
  const tag = normaliseTag(rawTag);
  if (!tag) return;
  const db = await getDatabase();
  await db.runAsync(
    'DELETE FROM photo_tags WHERE photo_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)',
    photoId,
    tag
  );
  await syncUserTags(db, photoId);
}

/** Mirrors the relational tags into the denormalised column + search blob. */
async function syncUserTags(db: SQLiteDatabase, photoId: string): Promise<void> {
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT t.name FROM tags t
     JOIN photo_tags pt ON pt.tag_id = t.id
     WHERE pt.photo_id = ?
     ORDER BY t.name`,
    photoId
  );
  const joined = rows.map((r) => r.name).join(',');
  await db.runAsync('UPDATE photos SET user_tags = ? WHERE id = ?', joined, photoId);
  await refreshSearchBlob(db, photoId);
}

export type TagCount = { name: string; count: number };

/** Every user tag with how many photos carry it, most used first. */
export async function listTagsWithCounts(): Promise<TagCount[]> {
  const db = await getDatabase();
  return db.getAllAsync<TagCount>(
    `SELECT t.name AS name, COUNT(pt.photo_id) AS count
     FROM tags t LEFT JOIN photo_tags pt ON pt.tag_id = t.id
     GROUP BY t.id
     HAVING count > 0
     ORDER BY count DESC, t.name ASC`
  );
}

/** Auto tags are stored as a comma blob, so they are counted in JS. */
export async function listAutoTagCounts(limit = 24): Promise<TagCount[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ auto_tags: string }>(
    `SELECT auto_tags FROM photos WHERE archived = 0 AND auto_tags != ''`
  );
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of parseTagList(row.auto_tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export type AlbumSummary = { name: string; count: number; cover: string | null };

export async function listAlbums(): Promise<AlbumSummary[]> {
  const db = await getDatabase();
  return db.getAllAsync<AlbumSummary>(
    `SELECT album_name AS name, COUNT(*) AS count, MAX(uri) AS cover
     FROM photos
     WHERE archived = 0 AND album_name IS NOT NULL AND album_name != ''
     GROUP BY album_name
     ORDER BY count DESC, name ASC`
  );
}

export type LibraryStats = {
  total: number;
  photos: number;
  videos: number;
  favorites: number;
  screenshots: number;
  tagged: number;
  withText: number;
  bytes: number;
  oldest: number | null;
  newest: number | null;
};

export async function getLibraryStats(): Promise<LibraryStats> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<LibraryStats>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN media_type = 'photo' THEN 1 ELSE 0 END) AS photos,
       SUM(CASE WHEN media_type = 'video' THEN 1 ELSE 0 END) AS videos,
       SUM(favorite) AS favorites,
       SUM(CASE WHEN auto_tags LIKE '%screenshot%' THEN 1 ELSE 0 END) AS screenshots,
       SUM(CASE WHEN user_tags != '' THEN 1 ELSE 0 END) AS tagged,
       SUM(CASE WHEN ocr_text IS NOT NULL AND ocr_text != '' THEN 1 ELSE 0 END) AS withText,
       COALESCE(SUM(file_size), 0) AS bytes,
       MIN(NULLIF(created_at, 0)) AS oldest,
       MAX(created_at) AS newest
     FROM photos WHERE archived = 0`
  );
  return (
    row ?? {
      total: 0, photos: 0, videos: 0, favorites: 0, screenshots: 0,
      tagged: 0, withText: 0, bytes: 0, oldest: null, newest: null,
    }
  );
}

/** Photos per month, newest first — powers the Insights timeline. */
export async function getMonthlyCounts(limit = 12): Promise<{ month: string; count: number }[]> {
  const db = await getDatabase();
  return db.getAllAsync<{ month: string; count: number }>(
    `SELECT strftime('%Y-%m', created_at / 1000, 'unixepoch') AS month, COUNT(*) AS count
     FROM photos
     WHERE archived = 0 AND created_at > 0
     GROUP BY month
     ORDER BY month DESC
     LIMIT ?`,
    limit
  );
}

/**
 * Photos still missing a usable perceptual hash, used by the deep scan.
 * A hash of the wrong length was written by an older fingerprint format and is
 * treated as missing so it gets recomputed.
 */
export async function getPhotosNeedingHash(limit: number, hashLength: number): Promise<Photo[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PhotoRow>(
    `SELECT ${PHOTO_COLUMNS} FROM photos
     WHERE media_type = 'photo' AND archived = 0
       AND (phash IS NULL OR (phash != 'unsupported' AND LENGTH(phash) != ?))
     ORDER BY created_at DESC LIMIT ?`,
    hashLength,
    limit
  );
  return rows.map(mapRow);
}

/** Deletes index rows whose ids are no longer present on the device. */
export async function pruneMissing(keepIds: Set<string>, source: Photo['source']): Promise<number> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM photos WHERE source = ?', source);
  const stale = rows.filter((r) => !keepIds.has(r.id)).map((r) => r.id);
  if (!stale.length) return 0;
  await db.withTransactionAsync(async () => {
    for (const id of stale) {
      await db.runAsync('DELETE FROM photos WHERE id = ?', id);
    }
  });
  return stale.length;
}

/**
 * Stores a CLIP embedding plus the visual tags derived from it.
 *
 * Written together in one statement because they are produced together: a
 * photo with an embedding but no tags, or the reverse, would make the "still
 * needs encoding" query ambiguous.
 */
export async function setEmbedding(
  photoId: string,
  embedding: Float32Array,
  visualTags: string[]
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE photos SET embedding = ?, embedded_at = ?, visual_tags = ? WHERE id = ?',
    embeddingToBytes(embedding),
    Date.now(),
    visualTags.join(','),
    photoId
  );
  await refreshSearchBlob(db, photoId);
}

/** Photos that have not been through the CLIP image encoder yet. */
export async function getPhotosNeedingEmbedding(limit: number): Promise<Photo[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PhotoRow>(
    `SELECT ${PHOTO_COLUMNS} FROM photos
     WHERE embedding IS NULL AND media_type = 'photo' AND archived = 0
     ORDER BY created_at DESC LIMIT ?`,
    limit
  );
  return rows.map(mapRow);
}

export async function countPhotosNeedingEmbedding(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM photos
     WHERE embedding IS NULL AND media_type = 'photo' AND archived = 0`
  );
  return row?.total ?? 0;
}

export async function countPhotosWithEmbedding(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number }>(
    'SELECT COUNT(*) AS total FROM photos WHERE embedding IS NOT NULL AND archived = 0'
  );
  return row?.total ?? 0;
}

/** Clears every stored embedding — used when the models are deleted. */
export async function clearEmbeddings(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE photos SET embedding = NULL, embedded_at = NULL, visual_tags = ''");
}

/**
 * Loads only the id and embedding for the photos matching a query.
 *
 * Semantic ranking happens in JavaScript, so the structured part of the query
 * runs in SQL first and only the survivors are pulled into memory. On a large
 * library that is the difference between reading a few hundred vectors and
 * reading tens of thousands.
 */
export async function loadEmbeddingsForQuery(
  query: ParsedQuery,
  limit = 4000
): Promise<{ id: string; embedding: Float32Array }[]> {
  const db = await getDatabase();
  const { sql, params } = buildWhereClause(query);
  const clause = sql ? `${sql} AND embedding IS NOT NULL` : 'WHERE embedding IS NOT NULL';

  // Streamed rather than fetched in one go: some SQLite backends return each
  // BLOB as a view into a buffer they reuse for the following row, so decoding
  // must happen — and copy — before the iterator moves on. Reading them all
  // first and decoding afterwards yields every row pointing at the same bytes.
  const rows = db.getEachAsync<{ id: string; embedding: Uint8Array | ArrayBuffer | null }>(
    `SELECT id, embedding FROM photos ${clause} ORDER BY created_at DESC LIMIT ?`,
    ...params,
    limit
  );

  const result: { id: string; embedding: Float32Array }[] = [];
  for await (const row of rows) {
    const embedding = bytesToEmbedding(row.embedding);
    if (embedding) result.push({ id: row.id, embedding });
  }
  return result;
}

/** Reads one photo's embedding. A single row has no buffer-reuse hazard. */
export async function getEmbedding(photoId: string): Promise<Float32Array | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ embedding: Uint8Array | ArrayBuffer | null }>(
    'SELECT embedding FROM photos WHERE id = ?',
    photoId
  );
  return bytesToEmbedding(row?.embedding);
}

/** Counts of every distinct visual tag, most common first. */
export async function listVisualTagCounts(limit = 30): Promise<TagCount[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ visual_tags: string }>(
    `SELECT visual_tags FROM photos WHERE archived = 0 AND visual_tags != ''`
  );
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of parseTagList(row.visual_tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}
