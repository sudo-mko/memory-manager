/** Saved searches turn a query string into a reusable smart folder. */

import { getDatabase } from './database';

export type SavedSearch = { id: number; name: string; query: string; createdAt: number };

export async function listSavedSearches(): Promise<SavedSearch[]> {
  const db = await getDatabase();
  return db.getAllAsync<SavedSearch>(
    'SELECT id, name, query, created_at AS createdAt FROM saved_searches ORDER BY created_at DESC'
  );
}

export async function saveSearch(name: string, query: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO saved_searches (name, query, created_at) VALUES (?, ?, ?)',
    name.trim().slice(0, 48) || query.slice(0, 48),
    query,
    Date.now()
  );
}

export async function deleteSavedSearch(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM saved_searches WHERE id = ?', id);
}

/** Keeps the last 12 non-empty queries so the search screen can suggest them. */
export async function recordRecentSearch(query: string): Promise<void> {
  const clean = query.trim();
  if (!clean) return;
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO recent_searches (query, used_at) VALUES (?, ?)
     ON CONFLICT(query) DO UPDATE SET used_at = excluded.used_at`,
    clean,
    Date.now()
  );
  await db.runAsync(
    'DELETE FROM recent_searches WHERE query NOT IN (SELECT query FROM recent_searches ORDER BY used_at DESC LIMIT 12)'
  );
}

export async function listRecentSearches(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ query: string }>(
    'SELECT query FROM recent_searches ORDER BY used_at DESC LIMIT 12'
  );
  return rows.map((r) => r.query);
}

export async function clearRecentSearches(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM recent_searches');
}
