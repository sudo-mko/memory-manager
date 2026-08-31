/**
 * Semantic search.
 *
 * Structured operators and meaning are complementary, so they are combined
 * rather than made into rival modes:
 *
 *   1. Everything except the free text (`is:screenshot`, `after:2025-01`,
 *      `tag:receipt`, `w>2000`) runs as SQL and narrows the candidate set.
 *   2. The free text is encoded by CLIP and used to *rank* what survives.
 *
 * So `beach is:favorite after:2024-06` means "of my favourites since June 2024,
 * the ones that most look like a beach" — which is neither pure keyword search
 * nor pure vector search, and is more useful than either alone.
 */

import { getPhotosByIds, loadEmbeddingsForQuery, type Photo } from '@/db/photos';
import { SIMILAR_IMAGE_THRESHOLD, rankBySimilarity, textImageRelevance } from '@/lib/vector';
import type { ParsedQuery } from '@/lib/query-parser';
import { clip } from '@/services/clip';

export type SemanticHit = {
  photo: Photo;
  /** Raw cosine similarity. */
  similarity: number;
  /** Readable 0–1 relevance derived from it. */
  relevance: number;
};

/** Below this rescaled relevance a result is noise rather than a weak match. */
const MIN_RELEVANCE = 0.12;

/**
 * Strips the free text from a parsed query, leaving only the structured
 * filters. The words become the ranking signal instead of a substring filter,
 * so a photo of a beach matches "beach" even when nothing about it says so.
 */
export function structuralOnly(query: ParsedQuery): ParsedQuery {
  return { ...query, terms: [], excluded: [], isEmpty: false };
}

/**
 * Runs a semantic query.
 *
 * @param phrase the free-text part of the query, already extracted
 * @param query  the full parsed query, whose structured half becomes the filter
 */
export async function searchSemantically(
  phrase: string,
  query: ParsedQuery,
  options: { limit?: number } = {}
): Promise<SemanticHit[]> {
  const trimmed = phrase.trim();
  if (!trimmed) return [];

  const queryVector = await clip.embedText(trimmed);
  const candidates = await loadEmbeddingsForQuery(structuralOnly(query));
  if (!candidates.length) return [];

  const ranked = rankBySimilarity(
    queryVector,
    candidates.map((candidate) => ({ item: candidate.id, embedding: candidate.embedding })),
    { limit: options.limit ?? 120 }
  ).filter((entry) => textImageRelevance(entry.score) >= MIN_RELEVANCE);

  if (!ranked.length) return [];

  // One query for the rows, then reorder to match the ranking — `IN (...)`
  // gives no ordering guarantee of its own.
  const photos = await getPhotosByIds(ranked.map((entry) => entry.item));
  const byId = new Map(photos.map((photo) => [photo.id, photo]));

  return ranked
    .map((entry) => {
      const photo = byId.get(entry.item);
      if (!photo) return null;
      return { photo, similarity: entry.score, relevance: textImageRelevance(entry.score) };
    })
    .filter((hit): hit is SemanticHit => hit !== null);
}

/**
 * Finds photos that look like the given one.
 * The photo itself is excluded, and the threshold is the image-to-image band —
 * far higher than the text one, because image vectors sit in a tight cone.
 */
export async function findSimilarPhotos(
  photo: Photo,
  embedding: Float32Array,
  options: { limit?: number; threshold?: number } = {}
): Promise<{ photo: Photo; similarity: number }[]> {
  const threshold = options.threshold ?? SIMILAR_IMAGE_THRESHOLD;

  const candidates = await loadEmbeddingsForQuery({
    terms: [], excluded: [], tags: [], excludedTags: [], albums: [],
    flags: [], excludedFlags: [], isEmpty: true,
  });

  const ranked = rankBySimilarity(
    embedding,
    candidates
      .filter((candidate) => candidate.id !== photo.id)
      .map((candidate) => ({ item: candidate.id, embedding: candidate.embedding })),
    { limit: options.limit ?? 40, minScore: threshold }
  );

  if (!ranked.length) return [];

  const photos = await getPhotosByIds(ranked.map((entry) => entry.item));
  const byId = new Map(photos.map((row) => [row.id, row]));

  return ranked
    .map((entry) => {
      const match = byId.get(entry.item);
      return match ? { photo: match, similarity: entry.score } : null;
    })
    .filter((hit): hit is { photo: Photo; similarity: number } => hit !== null);
}
