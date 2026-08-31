/**
 * Duplicate and near-duplicate detection.
 *
 * Two passes, cheapest first:
 *   1. Exact — same dimensions and same file size. Free, runs on the index.
 *   2. Similar — perceptual hashes within a small hamming distance. Requires the
 *      deep scan to have hashed the photos first.
 * Groups are ordered so the photo worth keeping (largest, then oldest) is first.
 */

import { getDatabase } from '@/db/database';
import { getPhotosNeedingHash, setPerceptualHash, type Photo } from '@/db/photos';
import { hammingDistance, isLowEntropyHash, similarity } from '@/lib/hash';
import { HASH_BITS, HASH_LENGTH, UNSUPPORTED, computePerceptualHash } from '@/services/phash';

/**
 * Hamming distance at or below this counts as "the same picture".
 * Roughly 7% of the 160 bits, which tolerates re-compression and resizing while
 * still separating two different photographs of the same scene.
 */
export const SIMILARITY_THRESHOLD = 11;

/**
 * Two photos are only compared when their shapes agree to within this fraction.
 * A duplicate that has been resized or re-compressed keeps its aspect ratio, so
 * this costs nothing in recall and removes a large class of false positives.
 */
const ASPECT_TOLERANCE = 0.06;

/** Aspect ratio, guarding against the zero heights the index can hold. */
function aspectRatio(photo: Photo): number {
  return photo.height > 0 ? photo.width / photo.height : 0;
}

/** True when two photos are close enough in shape to be the same picture. */
function shapesMatch(a: Photo, b: Photo): boolean {
  const ratioA = aspectRatio(a);
  const ratioB = aspectRatio(b);
  if (!ratioA || !ratioB) return false;
  return Math.abs(ratioA - ratioB) / Math.max(ratioA, ratioB) <= ASPECT_TOLERANCE;
}

export type DuplicateGroup = {
  key: string;
  kind: 'exact' | 'similar';
  photos: Photo[];
  /** Bytes that could be freed by keeping only the first photo. */
  reclaimable: number;
  /** 0–1, how alike the group members are. */
  confidence: number;
};

type PhotoRow = Record<string, any>;

function rowToPhoto(row: PhotoRow): Photo {
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
    source: row.source,
    autoTags: row.auto_tags ? String(row.auto_tags).split(',').filter(Boolean) : [],
    userTags: row.user_tags ? String(row.user_tags).split(',').filter(Boolean) : [],
    ocrText: row.ocr_text,
    phash: row.phash,
    visualTags: row.visual_tags ? String(row.visual_tags).split(',').filter(Boolean) : [],
    hasEmbedding: row.embedded_at != null,
    embeddedAt: row.embedded_at ?? null,
    favorite: row.favorite === 1,
    archived: row.archived === 1,
    note: row.note,
    indexedAt: row.indexed_at,
  };
}

/** Best copy first: biggest file, then earliest capture, then favourites. */
function rankKeepFirst(photos: Photo[]): Photo[] {
  return [...photos].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    const sizeDiff = (b.fileSize ?? 0) - (a.fileSize ?? 0);
    if (sizeDiff !== 0) return sizeDiff;
    const pixelDiff = b.width * b.height - a.width * a.height;
    if (pixelDiff !== 0) return pixelDiff;
    return a.createdAt - b.createdAt;
  });
}

function reclaimableBytes(photos: Photo[]): number {
  if (photos.length < 2) return 0;
  return photos.slice(1).reduce((sum, p) => sum + (p.fileSize ?? 0), 0);
}

/** Pass 1 — identical dimensions and byte size. */
export async function findExactDuplicates(): Promise<DuplicateGroup[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PhotoRow>(
    `SELECT * FROM photos
     WHERE archived = 0 AND file_size IS NOT NULL AND file_size > 0
     ORDER BY created_at DESC`
  );

  const buckets = new Map<string, Photo[]>();
  for (const row of rows) {
    const photo = rowToPhoto(row);
    const key = `${photo.width}x${photo.height}:${photo.fileSize}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(photo);
    else buckets.set(key, [photo]);
  }

  return [...buckets.entries()]
    .filter(([, photos]) => photos.length > 1)
    .map(([key, photos]) => {
      const ranked = rankKeepFirst(photos);
      return {
        key: `exact:${key}`,
        kind: 'exact' as const,
        photos: ranked,
        reclaimable: reclaimableBytes(ranked),
        confidence: 1,
      };
    })
    .sort((a, b) => b.reclaimable - a.reclaimable || b.photos.length - a.photos.length);
}

/**
 * Pass 2 — greedy clustering of perceptual hashes.
 *
 * Comparing every pair is O(n²); with the index capped at a few thousand hashed
 * photos this stays well under a second, and photos already claimed by a cluster
 * are skipped so the worst case shrinks quickly.
 */
export async function findSimilarGroups(threshold = SIMILARITY_THRESHOLD): Promise<DuplicateGroup[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PhotoRow>(
    `SELECT * FROM photos
     WHERE archived = 0 AND phash IS NOT NULL AND LENGTH(phash) = ?
     ORDER BY created_at DESC`,
    HASH_LENGTH
  );
  // Hashes without enough variation cannot discriminate, so they are dropped
  // rather than allowed to cluster everything together.
  const photos = rows.map(rowToPhoto).filter((photo) => !isLowEntropyHash(photo.phash!, HASH_BITS));

  const claimed = new Set<string>();
  const groups: DuplicateGroup[] = [];

  for (let i = 0; i < photos.length; i += 1) {
    const anchor = photos[i];
    if (claimed.has(anchor.id)) continue;

    const cluster: Photo[] = [anchor];
    let worstDistance = 0;

    for (let j = i + 1; j < photos.length; j += 1) {
      const candidate = photos[j];
      if (claimed.has(candidate.id)) continue;
      if (!shapesMatch(anchor, candidate)) continue;
      const distance = hammingDistance(anchor.phash!, candidate.phash!);
      if (distance <= threshold) {
        cluster.push(candidate);
        claimed.add(candidate.id);
        worstDistance = Math.max(worstDistance, distance);
      }
    }

    if (cluster.length > 1) {
      claimed.add(anchor.id);
      const ranked = rankKeepFirst(cluster);
      groups.push({
        key: `similar:${anchor.phash}`,
        kind: 'similar',
        photos: ranked,
        reclaimable: reclaimableBytes(ranked),
        confidence: similarity(worstDistance, HASH_BITS),
      });
    }
  }

  return groups.sort(
    (a, b) => b.photos.length - a.photos.length || b.confidence - a.confidence
  );
}

export type DeepScanProgress = { done: number; total: number };

/**
 * Hashes photos that do not yet have a fingerprint.
 * Runs in small batches with a yield between each so the UI stays interactive.
 */
export async function runDeepScan(
  limit: number,
  onProgress?: (progress: DeepScanProgress) => void,
  shouldCancel?: () => boolean
): Promise<number> {
  const pending = await getPhotosNeedingHash(limit, HASH_LENGTH);
  let done = 0;

  for (const photo of pending) {
    if (shouldCancel?.()) break;
    const hash = await computePerceptualHash(photo.uri);
    // Store a sentinel for undecodable images so we do not retry them forever.
    await setPerceptualHash(photo.id, hash ?? UNSUPPORTED);
    done += 1;
    onProgress?.({ done, total: pending.length });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return done;
}

/** How many photos still need hashing — shown on the duplicates screen. */
export async function countUnhashed(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM photos
     WHERE media_type = 'photo' AND archived = 0
       AND (phash IS NULL OR (phash != 'unsupported' AND LENGTH(phash) != ?))`,
    HASH_LENGTH
  );
  return row?.total ?? 0;
}
