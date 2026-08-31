/**
 * Database bootstrap.
 *
 * `getDatabase()` opens (once) and migrates the SQLite file. Every other module
 * awaits it rather than opening its own handle, so migrations can never race.
 */

import * as SQLite from 'expo-sqlite';

import { FINGERPRINT_VERSION } from '@/services/phash';

import { CREATE_INDEXES, CREATE_TABLES, MIGRATIONS, SCHEMA_VERSION } from './schema';

export const DATABASE_NAME = 'sift.db';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Brings an existing database up to the current schema version.
 *
 * `CREATE TABLE IF NOT EXISTS` cannot add a column to a table that already
 * exists, so upgrades run explicit `ALTER TABLE` statements. Each one is
 * tolerated failing: a database that already has the column (because it was
 * created fresh from the current schema) should not block startup.
 */
async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM meta WHERE key = ?',
    'schema_version'
  );
  const current = Number(row?.value ?? 0);
  if (current >= SCHEMA_VERSION) return;

  for (let version = current + 1; version <= SCHEMA_VERSION; version += 1) {
    for (const statement of MIGRATIONS[version] ?? []) {
      try {
        await db.execAsync(statement);
      } catch {
        // Already applied — expected on a database created from the latest
        // schema, where `schema_version` had simply not been written yet.
      }
    }
  }
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  // Order matters: tables first, then column migrations, then indexes — an
  // index over a column that an upgrade has not added yet would fail and take
  // the whole bootstrap down with it.
  await db.execAsync(CREATE_TABLES);
  await migrate(db);
  await db.execAsync(CREATE_INDEXES);
  await db.runAsync(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    'schema_version',
    String(SCHEMA_VERSION)
  );

  // Fingerprints written by an older algorithm are not comparable with new
  // ones, so they are dropped and recomputed on the next deep scan.
  const storedFingerprint = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM meta WHERE key = ?',
    'fingerprint_version'
  );
  if (Number(storedFingerprint?.value ?? 0) !== FINGERPRINT_VERSION) {
    await db.runAsync('UPDATE photos SET phash = NULL');
    await db.runAsync(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      'fingerprint_version',
      String(FINGERPRINT_VERSION)
    );
  }

  return db;
}

/** Opens the database on first call and returns the same handle afterwards. */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = open().catch((error) => {
      // Reset so a later attempt can retry instead of caching a failed promise.
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

/** Reads a value from the key/value `meta` table. */
export async function getMeta(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM meta WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

/** Writes a value into the key/value `meta` table. */
export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value
  );
}

/** Drops every row but keeps the schema — used by "Reset index" in Settings. */
export async function clearIndex(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    DELETE FROM collection_photos;
    DELETE FROM photo_tags;
    DELETE FROM photos;
    DELETE FROM tags;
    DELETE FROM recent_searches;
  `);
}
