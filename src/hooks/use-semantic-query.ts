/**
 * Runs a query through CLIP instead of through `LIKE`.
 *
 * Mirrors `usePhotoQuery` — same debounce, same revision invalidation, same
 * stale-result guard — so the search screen can switch between keyword and
 * meaning without either path behaving differently.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useLibrary } from '@/contexts/library-context';
import { freeText, parseQuery } from '@/lib/query-parser';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { searchSemantically, type SemanticHit } from '@/services/semantic-search';

export type SemanticQueryResult = {
  hits: SemanticHit[];
  loading: boolean;
  error: string | null;
  /** The plain-language phrase actually sent to the model. */
  phrase: string;
  reload: () => void;
};

export function useSemanticQuery(
  queryText: string,
  options: { enabled?: boolean; limit?: number; debounceMs?: number } = {}
): SemanticQueryResult {
  const { revision } = useLibrary();
  const enabled = options.enabled ?? true;
  // Encoding a sentence is far more expensive than a SQL LIKE, so wait a little
  // longer for typing to settle than the keyword path does.
  const debounced = useDebouncedValue(queryText, options.debounceMs ?? 420);
  const [hits, setHits] = useState<SemanticHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualReload, setManualReload] = useState(0);
  const runIdRef = useRef(0);

  const parsed = parseQuery(debounced);
  const phrase = freeText(parsed);

  const active = enabled && phrase.length > 0;

  useEffect(() => {
    // Nothing to encode: the inactive result is derived below rather than
    // written back into state, which keeps the effect free of synchronous
    // updates and avoids a wasted render whenever the query is cleared.
    if (!active) return;

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const results = await searchSemantically(phrase, parseQuery(debounced), {
          limit: options.limit ?? 120,
        });
        if (cancelled || runIdRef.current !== runId) return;
        setHits(results);
        setError(null);
      } catch (err) {
        if (cancelled || runIdRef.current !== runId) return;
        setHits([]);
        setError(err instanceof Error ? err.message : 'Smart search failed');
      } finally {
        if (!cancelled && runIdRef.current === runId) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debounced, phrase, active, revision, manualReload, options.limit]);

  const reload = useCallback(() => setManualReload((n) => n + 1), []);

  return {
    hits: active ? hits : [],
    loading: active ? loading : false,
    error: active ? error : null,
    phrase,
    reload,
  };
}
