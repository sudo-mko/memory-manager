/**
 * Smart-search state.
 *
 * Bridges the CLIP engine singleton (which owns the native models) and the
 * database counts into React. Kept separate from `LibraryProvider` because the
 * lifecycle is different: models are downloaded rarely, weigh hundreds of
 * megabytes, and every screen needs to know whether they are ready.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useLibrary } from '@/contexts/library-context';
import { clearEmbeddings, countPhotosNeedingEmbedding, countPhotosWithEmbedding } from '@/db/photos';
import {
  MODEL_SIZES,
  canEncodeOnThisDevice,
  clip,
  isClipSupported,
  type EncoderKind,
  type EncoderState,
} from '@/services/clip';
import { ENCODE_BATCH_SIZE, runSemanticIndex, type EncodeProgress } from '@/services/semantic-index';

export type ClipContextValue = {
  /** False in an Expo Go build, where the native module is absent. */
  supported: boolean;
  /** False on emulators, where the encoders would crash the process. */
  canEncode: boolean;
  encoders: Record<EncoderKind, EncoderState>;
  /** Photos that already have an embedding. */
  encodedCount: number;
  /** Photos still waiting to be encoded. */
  pendingCount: number;
  indexing: boolean;
  indexProgress: EncodeProgress | null;
  indexError: string | null;
  /** True when a typed sentence can be turned into a search. */
  canSearchByMeaning: boolean;
  /** True when there is anything to compare against. */
  canFindSimilar: boolean;
  downloadSizes: typeof MODEL_SIZES;
  enableEncoder: (kind: EncoderKind) => Promise<void>;
  startIndexing: (limit?: number) => Promise<void>;
  cancelIndexing: () => void;
  forgetEmbeddings: () => Promise<void>;
  refreshCounts: () => Promise<void>;
};

const ClipContext = createContext<ClipContextValue | null>(null);

export function ClipProvider({ children }: { children: React.ReactNode }) {
  const { revision, invalidate } = useLibrary();
  const [encoders, setEncoders] = useState(clip.getState());
  const [encodedCount, setEncodedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [indexing, setIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState<EncodeProgress | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  // Read synchronously inside the encoding loop so cancelling takes effect
  // between photos rather than waiting for a re-render.
  const cancelRef = useRef(false);

  const supported = isClipSupported();
  const [canEncode, setCanEncode] = useState(false);

  // The hazard probe reads a file, so capability resolves asynchronously.
  useEffect(() => {
    let cancelled = false;
    void canEncodeOnThisDevice().then((ok) => {
      if (!cancelled) setCanEncode(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => clip.subscribe(setEncoders), []);

  const refreshCounts = useCallback(async () => {
    const [encoded, pending] = await Promise.all([
      countPhotosWithEmbedding(),
      countPhotosNeedingEmbedding(),
    ]);
    setEncodedCount(encoded);
    setPendingCount(pending);
  }, []);

  // Recount whenever the library changes. The work happens inside the effect
  // rather than through `refreshCounts` so no state is set synchronously, and a
  // cancel guard stops a slow query from writing into an unmounted provider.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [encoded, pending] = await Promise.all([
        countPhotosWithEmbedding(),
        countPhotosNeedingEmbedding(),
      ]);
      if (cancelled) return;
      setEncodedCount(encoded);
      setPendingCount(pending);
    })();
    return () => {
      cancelled = true;
    };
  }, [revision]);

  const enableEncoder = useCallback(async (kind: EncoderKind) => {
    try {
      await clip.load(kind);
    } catch {
      // The failure is already reflected in the encoder state, which the UI
      // renders; rethrowing here would only produce an unhandled rejection.
    }
  }, []);

  const startIndexing = useCallback(
    async (limit = ENCODE_BATCH_SIZE) => {
      if (indexing) return;
      cancelRef.current = false;
      setIndexing(true);
      setIndexError(null);
      try {
        await runSemanticIndex(
          limit,
          (progress) => setIndexProgress(progress),
          () => cancelRef.current
        );
        invalidate();
      } catch (error) {
        setIndexError(error instanceof Error ? error.message : 'Encoding failed');
      } finally {
        setIndexing(false);
        setIndexProgress(null);
        await refreshCounts();
      }
    },
    [indexing, invalidate, refreshCounts]
  );

  const cancelIndexing = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const forgetEmbeddings = useCallback(async () => {
    await clearEmbeddings();
    invalidate();
    await refreshCounts();
  }, [invalidate, refreshCounts]);

  const value = useMemo<ClipContextValue>(
    () => ({
      supported,
      canEncode,
      encoders,
      encodedCount,
      pendingCount,
      indexing,
      indexProgress,
      indexError,
      canSearchByMeaning: encoders.text.status === 'ready' && encodedCount > 0,
      canFindSimilar: encodedCount > 1,
      downloadSizes: MODEL_SIZES,
      enableEncoder,
      startIndexing,
      cancelIndexing,
      forgetEmbeddings,
      refreshCounts,
    }),
    [
      supported, canEncode, encoders, encodedCount, pendingCount, indexing, indexProgress, indexError,
      enableEncoder, startIndexing, cancelIndexing, forgetEmbeddings, refreshCounts,
    ]
  );

  return <ClipContext.Provider value={value}>{children}</ClipContext.Provider>;
}

export function useClip(): ClipContextValue {
  const context = useContext(ClipContext);
  if (!context) throw new Error('useClip must be used inside <ClipProvider>');
  return context;
}
