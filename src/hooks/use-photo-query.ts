/**
 * Runs a Sift query against the index and keeps the result in sync.
 *
 * Re-runs when the query text changes (debounced), when the sort order changes,
 * or when the library revision is bumped by a mutation. A run counter guards
 * against a slow earlier query overwriting a newer result.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useLibrary } from '@/contexts/library-context';
import { countPhotos, searchPhotos, type Photo, type SortOrder } from '@/db/photos';
import { parseQuery } from '@/lib/query-parser';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

export type PhotoQueryResult = {
  photos: Photo[];
  total: number;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function usePhotoQuery(
  queryText: string,
  sort: SortOrder = 'newest',
  options: { limit?: number; debounceMs?: number } = {}
): PhotoQueryResult {
  const { revision } = useLibrary();
  const debouncedQuery = useDebouncedValue(queryText, options.debounceMs ?? 220);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualReload, setManualReload] = useState(0);
  const runIdRef = useRef(0);

  useEffect(() => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const parsed = parseQuery(debouncedQuery);
        const [rows, count] = await Promise.all([
          searchPhotos(parsed, { sort, limit: options.limit ?? 600 }),
          countPhotos(parsed),
        ]);
        // Ignore results from a query that has since been superseded.
        if (cancelled || runIdRef.current !== runId) return;
        setPhotos(rows);
        setTotal(count);
        setError(null);
      } catch (err) {
        if (cancelled || runIdRef.current !== runId) return;
        setError(err instanceof Error ? err.message : 'Search failed');
        setPhotos([]);
        setTotal(0);
      } finally {
        if (!cancelled && runIdRef.current === runId) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, sort, revision, manualReload, options.limit]);

  const reload = useCallback(() => setManualReload((n) => n + 1), []);

  return { photos, total, loading, error, reload };
}
