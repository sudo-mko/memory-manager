/**
 * Library state.
 *
 * The index itself lives in SQLite, so this context deliberately does *not*
 * mirror the photo list in memory. It holds the things every screen needs
 * (stats, tags, albums, collections, scan progress) plus a `revision` counter.
 * Screens run their own queries through `usePhotoQuery` and re-run them when
 * `revision` changes, which keeps a 20,000 photo library off the JS heap while
 * still giving instant, consistent updates after any mutation.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';

import { getMeta } from '@/db/database';
import {
  addTag as addTagToPhoto,
  getLibraryStats,
  listAlbums,
  listAutoTagCounts,
  listTagsWithCounts,
  listVisualTagCounts,
  removeTag as removeTagFromPhoto,
  setArchived,
  setFavorite,
  setNote,
  setOcrText,
  type AlbumSummary,
  type LibraryStats,
  type TagCount,
} from '@/db/photos';
import { listCollections, type Collection } from '@/db/collections';
import { listSavedSearches, type SavedSearch } from '@/db/saved-searches';
import {
  PermissionDeniedError,
  ensureMediaPermission,
  runIndex,
  type IndexProgress,
} from '@/services/indexer';
import { removeDemoLibrary, seedDemoLibrary } from '@/services/demo-library';

export type ScanState = {
  running: boolean;
  progress: IndexProgress | null;
  error: string | null;
  lastIndexedAt: number | null;
};

type State = {
  ready: boolean;
  /** Increments on every mutation; screens use it as a query dependency. */
  revision: number;
  stats: LibraryStats | null;
  userTags: TagCount[];
  autoTags: TagCount[];
  /** Tags CLIP recognised in the pictures themselves. */
  visualTags: TagCount[];
  albums: AlbumSummary[];
  collections: Collection[];
  savedSearches: SavedSearch[];
  scan: ScanState;
  permissionDenied: boolean;
};

type Action =
  | { type: 'snapshot'; payload: Omit<State, 'ready' | 'revision' | 'scan' | 'permissionDenied'> }
  | { type: 'bump' }
  | { type: 'scan/start' }
  | { type: 'scan/progress'; progress: IndexProgress }
  | { type: 'scan/finish'; at: number }
  | { type: 'scan/error'; message: string }
  | { type: 'permission'; denied: boolean }
  | { type: 'lastIndexedAt'; at: number | null };

const INITIAL: State = {
  ready: false,
  revision: 0,
  stats: null,
  userTags: [],
  autoTags: [],
  visualTags: [],
  albums: [],
  collections: [],
  savedSearches: [],
  scan: { running: false, progress: null, error: null, lastIndexedAt: null },
  permissionDenied: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'snapshot':
      return { ...state, ...action.payload, ready: true };
    case 'bump':
      return { ...state, revision: state.revision + 1 };
    case 'scan/start':
      return { ...state, scan: { ...state.scan, running: true, error: null, progress: null } };
    case 'scan/progress':
      return { ...state, scan: { ...state.scan, progress: action.progress } };
    case 'scan/finish':
      return {
        ...state,
        revision: state.revision + 1,
        scan: { ...state.scan, running: false, lastIndexedAt: action.at, progress: null },
      };
    case 'scan/error':
      return { ...state, scan: { ...state.scan, running: false, error: action.message } };
    case 'permission':
      return { ...state, permissionDenied: action.denied };
    case 'lastIndexedAt':
      return { ...state, scan: { ...state.scan, lastIndexedAt: action.at } };
    default:
      return state;
  }
}

type LibraryContextValue = State & {
  /** Re-reads stats, tags, albums, collections and saved searches. */
  refresh: () => Promise<void>;
  /** Signals that photo rows changed so open queries re-run. */
  invalidate: () => void;
  startScan: () => Promise<void>;
  cancelScan: () => void;
  requestPermission: () => Promise<boolean>;
  setDemoLibrary: (enabled: boolean) => Promise<void>;
  toggleFavorite: (photoId: string, next: boolean) => Promise<void>;
  archivePhoto: (photoId: string, next: boolean) => Promise<void>;
  savePhotoNote: (photoId: string, note: string) => Promise<void>;
  savePhotoText: (photoId: string, text: string) => Promise<void>;
  addTag: (photoId: string, tag: string) => Promise<string | null>;
  removeTag: (photoId: string, tag: string) => Promise<void>;
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  // Read synchronously inside the scan loop, so a cancel takes effect between
  // pages without waiting for a re-render.
  const cancelRef = useRef(false);

  const refresh = useCallback(async () => {
    const [stats, userTags, autoTags, visualTags, albums, collections, savedSearches] = await Promise.all([
      getLibraryStats(),
      listTagsWithCounts(),
      listAutoTagCounts(),
      listVisualTagCounts(),
      listAlbums(),
      listCollections(),
      listSavedSearches(),
    ]);
    dispatch({
      type: 'snapshot',
      payload: { stats, userTags, autoTags, visualTags, albums, collections, savedSearches },
    });
  }, []);

  const invalidate = useCallback(() => {
    dispatch({ type: 'bump' });
    void refresh();
  }, [refresh]);

  // Initial load: read the index that is already on disk before doing anything
  // expensive, so the app opens straight into content after a cold start.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const last = await getMeta('last_index_at');
        if (!cancelled && last) dispatch({ type: 'lastIndexedAt', at: Number(last) });
        await refresh();
      } catch {
        if (!cancelled) dispatch({ type: 'scan/error', message: 'Could not open the photo index.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const startScan = useCallback(async () => {
    if (state.scan.running) return;
    cancelRef.current = false;
    dispatch({ type: 'scan/start' });
    try {
      await runIndex(
        (progress) => dispatch({ type: 'scan/progress', progress }),
        () => cancelRef.current
      );
      dispatch({ type: 'permission', denied: false });
      dispatch({ type: 'scan/finish', at: Date.now() });
      await refresh();
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        dispatch({ type: 'permission', denied: true });
        dispatch({ type: 'scan/error', message: 'Photo access was denied. Turn on the demo library instead, or grant access in system settings.' });
      } else {
        dispatch({
          type: 'scan/error',
          message: error instanceof Error ? error.message : 'The scan failed unexpectedly.',
        });
      }
    }
  }, [refresh, state.scan.running]);

  const cancelScan = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const requestPermission = useCallback(async () => {
    const granted = await ensureMediaPermission();
    dispatch({ type: 'permission', denied: !granted });
    return granted;
  }, []);

  const setDemoLibrary = useCallback(
    async (enabled: boolean) => {
      if (enabled) await seedDemoLibrary();
      else await removeDemoLibrary();
      invalidate();
    },
    [invalidate]
  );

  // Each mutation writes to SQLite and then bumps the revision so every open
  // query refetches. One code path, no cache to keep in sync.
  const mutate = useCallback(
    async (work: () => Promise<void>) => {
      await work();
      invalidate();
    },
    [invalidate]
  );

  const value = useMemo<LibraryContextValue>(
    () => ({
      ...state,
      refresh,
      invalidate,
      startScan,
      cancelScan,
      requestPermission,
      setDemoLibrary,
      toggleFavorite: (photoId, next) => mutate(() => setFavorite(photoId, next)),
      archivePhoto: (photoId, next) => mutate(() => setArchived(photoId, next)),
      savePhotoNote: (photoId, note) => mutate(() => setNote(photoId, note)),
      savePhotoText: (photoId, text) => mutate(() => setOcrText(photoId, text)),
      addTag: async (photoId, tag) => {
        const created = await addTagToPhoto(photoId, tag);
        invalidate();
        return created;
      },
      removeTag: (photoId, tag) => mutate(() => removeTagFromPhoto(photoId, tag)),
    }),
    [state, refresh, invalidate, startScan, cancelScan, requestPermission, setDemoLibrary, mutate]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext);
  if (!context) throw new Error('useLibrary must be used inside <LibraryProvider>');
  return context;
}
