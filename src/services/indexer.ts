/**
 * The indexer walks the device media library in pages and writes every asset
 * into SQLite. It is deliberately incremental and cancellable: scanning tens of
 * thousands of photos must never block the UI thread or lock the user out of
 * the app, and re-running it must be cheap and non-destructive.
 */

// SDK 57 ships a new object-oriented MediaLibrary API alongside the classic
// one. The classic API is used here because it exposes cursor-based paging,
// which is what makes an incremental, cancellable scan possible.
import * as MediaLibrary from 'expo-media-library/legacy';

import { deriveAutoTags } from '@/services/auto-tag';
import { pruneMissing, upsertPhotos, type PhotoInput } from '@/db/photos';
import { setMeta } from '@/db/database';

/** How many assets we pull from the OS per page. */
const PAGE_SIZE = 200;

export type IndexProgress = {
  scanned: number;
  total: number;
  phase: 'idle' | 'permission' | 'albums' | 'scanning' | 'cleanup' | 'done' | 'error';
  message?: string;
};

export type IndexResult = {
  indexed: number;
  removed: number;
  durationMs: number;
};

/** Thrown when the user declined the media permission. */
export class PermissionDeniedError extends Error {
  constructor() {
    super('Photo library permission was not granted');
    this.name = 'PermissionDeniedError';
  }
}

/** Asks for read access, returning true only when we can actually enumerate. */
export async function ensureMediaPermission(): Promise<boolean> {
  const current = await MediaLibrary.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await MediaLibrary.requestPermissionsAsync();
  return requested.granted;
}

/** Maps album ids to their human readable titles so photos get a folder name. */
async function loadAlbumNames(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  try {
    const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
    for (const album of albums) names.set(album.id, album.title);
  } catch {
    // Album enumeration is optional; the scan still works without folder names.
  }
  return names;
}

function toPhotoInput(
  asset: MediaLibrary.Asset,
  albumNames: Map<string, string>
): PhotoInput {
  const albumName = asset.albumId ? (albumNames.get(asset.albumId) ?? null) : null;
  const mediaType: 'photo' | 'video' = asset.mediaType === MediaLibrary.MediaType.video ? 'video' : 'photo';
  const createdAt = asset.creationTime || asset.modificationTime || 0;

  return {
    id: asset.id,
    uri: asset.uri,
    filename: asset.filename ?? 'unknown',
    mediaType,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
    duration: asset.duration ?? 0,
    createdAt,
    modifiedAt: asset.modificationTime || createdAt,
    albumName,
    source: 'device',
    autoTags: deriveAutoTags({
      filename: asset.filename ?? '',
      albumName,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
      mediaType,
      createdAt,
    }),
  };
}

/**
 * Scans the whole library.
 *
 * @param onProgress called after every page so the UI can show a live count
 * @param shouldCancel polled between pages; return true to stop early
 */
export async function runIndex(
  onProgress?: (progress: IndexProgress) => void,
  shouldCancel?: () => boolean
): Promise<IndexResult> {
  const startedAt = Date.now();
  onProgress?.({ scanned: 0, total: 0, phase: 'permission' });

  const granted = await ensureMediaPermission();
  if (!granted) throw new PermissionDeniedError();

  onProgress?.({ scanned: 0, total: 0, phase: 'albums' });
  const albumNames = await loadAlbumNames();

  const seenIds = new Set<string>();
  let after: string | undefined;
  let hasNextPage = true;
  let scanned = 0;
  let total = 0;

  while (hasNextPage) {
    if (shouldCancel?.()) break;

    const page = await MediaLibrary.getAssetsAsync({
      first: PAGE_SIZE,
      after,
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      sortBy: [MediaLibrary.SortBy.creationTime],
    });

    total = page.totalCount ?? total;
    if (!page.assets.length) break;

    const batch = page.assets.map((asset) => {
      seenIds.add(asset.id);
      return toPhotoInput(asset, albumNames);
    });
    await upsertPhotos(batch);

    scanned += batch.length;
    after = page.endCursor;
    hasNextPage = page.hasNextPage;
    onProgress?.({ scanned, total, phase: 'scanning' });

    // Yield to the JS event loop so taps and animations stay responsive.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  onProgress?.({ scanned, total, phase: 'cleanup' });
  // Only prune when the scan ran to completion, otherwise a cancelled run would
  // delete every asset it had not reached yet.
  const removed = shouldCancel?.() ? 0 : await pruneMissing(seenIds, 'device');

  await setMeta('last_index_at', String(Date.now()));
  onProgress?.({ scanned, total, phase: 'done' });

  return { indexed: scanned, removed, durationMs: Date.now() - startedAt };
}
