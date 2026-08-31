/** Collections are user-made buckets of photos that cut across device albums. */

import { getDatabase } from './database';

export type Collection = {
  id: number;
  name: string;
  icon: string;
  createdAt: number;
  count: number;
  cover: string | null;
};

export async function listCollections(): Promise<Collection[]> {
  const db = await getDatabase();
  return db.getAllAsync<Collection>(
    `SELECT c.id, c.name, c.icon, c.created_at AS createdAt,
            COUNT(cp.photo_id) AS count,
            (SELECT p.uri FROM collection_photos cp2
               JOIN photos p ON p.id = cp2.photo_id
              WHERE cp2.collection_id = c.id
              ORDER BY cp2.added_at DESC LIMIT 1) AS cover
     FROM collections c
     LEFT JOIN collection_photos cp ON cp.collection_id = c.id
     GROUP BY c.id
     ORDER BY c.created_at DESC`
  );
}

export async function createCollection(name: string, icon = 'albums-outline'): Promise<number | null> {
  const clean = name.trim().slice(0, 48);
  if (!clean) return null;
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO collections (name, icon, created_at) VALUES (?, ?, ?) ON CONFLICT(name) DO NOTHING',
    clean,
    icon,
    Date.now()
  );
  if (result.changes > 0) return result.lastInsertRowId;
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM collections WHERE name = ?',
    clean
  );
  return existing?.id ?? null;
}

export async function deleteCollection(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM collections WHERE id = ?', id);
}

export async function addToCollection(collectionId: number, photoId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO collection_photos (collection_id, photo_id, added_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
    collectionId,
    photoId,
    Date.now()
  );
}

export async function removeFromCollection(collectionId: number, photoId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'DELETE FROM collection_photos WHERE collection_id = ? AND photo_id = ?',
    collectionId,
    photoId
  );
}

export async function getCollection(id: number): Promise<Collection | null> {
  const all = await listCollections();
  return all.find((c) => c.id === id) ?? null;
}

/** Ids of the collections a given photo belongs to. */
export async function getCollectionsForPhoto(photoId: string): Promise<number[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ collection_id: number }>(
    'SELECT collection_id FROM collection_photos WHERE photo_id = ?',
    photoId
  );
  return rows.map((r) => r.collection_id);
}

export async function listCollectionPhotoIds(collectionId: number): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ photo_id: string }>(
    'SELECT photo_id FROM collection_photos WHERE collection_id = ? ORDER BY added_at DESC',
    collectionId
  );
  return rows.map((r) => r.photo_id);
}
