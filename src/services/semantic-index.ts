/**
 * Builds the semantic layer of the index.
 *
 * Runs the CLIP image encoder over photos that do not yet have an embedding,
 * derives visual tags from each result, and writes both back. Deliberately
 * batched, cancellable and yielding: encoding a photo takes tens of
 * milliseconds on a phone, so a large library must never block the UI or become
 * an all-or-nothing operation.
 */

import {
  countPhotosNeedingEmbedding,
  getEmbedding,
  getPhotosNeedingEmbedding,
  setEmbedding,
  type Photo,
} from '@/db/photos';
import { clip } from '@/services/clip';
import { visualTagsFor } from '@/services/zero-shot';

export type EncodeProgress = {
  done: number;
  total: number;
  /** Filename of the photo currently being encoded, for the status line. */
  current: string | null;
};

export type EncodeResult = {
  encoded: number;
  failed: number;
  cancelled: boolean;
};

/** Photos per run, so one tap has a bounded, predictable cost. */
export const ENCODE_BATCH_SIZE = 200;

/**
 * Encodes up to `limit` photos.
 *
 * @param onProgress called after every photo
 * @param shouldCancel polled between photos; return true to stop cleanly
 */
export async function runSemanticIndex(
  limit = ENCODE_BATCH_SIZE,
  onProgress?: (progress: EncodeProgress) => void,
  shouldCancel?: () => boolean
): Promise<EncodeResult> {
  // Loading the encoder may trigger a download; surface that before claiming
  // any progress on the photos themselves.
  await clip.load('image');

  const pending = await getPhotosNeedingEmbedding(limit);
  let encoded = 0;
  let failed = 0;

  for (const photo of pending) {
    if (shouldCancel?.()) return { encoded, failed, cancelled: true };

    onProgress?.({ done: encoded + failed, total: pending.length, current: photo.filename });

    const embedding = await clip.embedImage(photo.uri);
    if (embedding) {
      await setEmbedding(photo.id, embedding, visualTagsFor(embedding));
      encoded += 1;
    } else {
      // A file the decoder cannot open (or a permission that has since been
      // revoked) is skipped. It stays queued and will be retried next run
      // rather than silently counted as done.
      failed += 1;
    }

    // Hand the thread back so taps and scrolling stay responsive.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  onProgress?.({ done: encoded + failed, total: pending.length, current: null });
  return { encoded, failed, cancelled: false };
}

/** How many photos are still waiting to be encoded. */
export async function countPending(): Promise<number> {
  return countPhotosNeedingEmbedding();
}

/**
 * Encodes a single photo on demand — used by "Find similar" when the user
 * reaches a photo the background pass has not got to yet.
 */
export async function ensurePhotoEncoded(photo: Photo): Promise<Float32Array | null> {
  if (photo.hasEmbedding) {
    const stored = await getEmbedding(photo.id);
    if (stored) return stored;
  }
  const embedding = await clip.embedImage(photo.uri);
  if (!embedding) return null;
  await setEmbedding(photo.id, embedding, visualTagsFor(embedding));
  return embedding;
}
