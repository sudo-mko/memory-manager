/**
 * Vector maths for semantic search.
 *
 * CLIP maps images and text into the same 512-dimensional space, so "find the
 * photos that match this sentence" becomes "find the nearest vectors". All of
 * it is plain arithmetic with no model involved, which keeps it unit testable
 * and lets the search path run identically on every platform.
 */

/** Dimensions of a CLIP ViT-B/32 embedding. */
export const EMBEDDING_DIM = 512;

/** Bytes one stored embedding occupies (float32). */
export const EMBEDDING_BYTES = EMBEDDING_DIM * 4;

/** Euclidean length of a vector. */
export function magnitude(vector: Float32Array | number[]): number {
  let total = 0;
  for (let i = 0; i < vector.length; i += 1) total += vector[i] * vector[i];
  return Math.sqrt(total);
}

/**
 * Scales a vector to unit length.
 * Returns a copy; a zero vector is returned unchanged rather than producing NaN.
 */
export function normalise(vector: Float32Array | number[]): Float32Array {
  const length = magnitude(vector);
  const result = new Float32Array(vector.length);
  if (length === 0) return result;
  for (let i = 0; i < vector.length; i += 1) result[i] = vector[i] / length;
  return result;
}

/** Dot product. Vectors of differing length return 0 rather than throwing. */
export function dot(a: Float32Array | number[], b: Float32Array | number[]): number {
  if (a.length !== b.length) return 0;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += a[i] * b[i];
  return total;
}

/**
 * Cosine similarity in the range -1..1.
 * When both inputs are already unit length this is just the dot product, which
 * is why embeddings are normalised once on the way into the index.
 */
export function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  const lengths = magnitude(a) * magnitude(b);
  if (lengths === 0) return 0;
  return dot(a, b) / lengths;
}

/** Rescales a value from [floor, ceiling] onto 0..1, clamped. */
function rescale(value: number, floor: number, ceiling: number): number {
  return Math.max(0, Math.min(1, (value - floor) / (ceiling - floor)));
}

/**
 * Text-to-image relevance as a readable 0..1 score.
 *
 * Raw CLIP similarities are useless as a percentage: text and image vectors
 * never point the same way, so even a perfect match lands near 0.32 while an
 * irrelevant one still scores 0.20. Measured over the bundled sample library,
 * correct matches ran 0.26–0.33 and poor ones 0.20–0.23, which is the band
 * rescaled here.
 */
export function textImageRelevance(similarity: number): number {
  return rescale(similarity, 0.2, 0.31);
}

/**
 * Image-to-image relevance as a readable 0..1 score.
 *
 * Image embeddings sit in a much tighter cone than text ones: across every pair
 * in the sample library the *median unrelated* pair still scored 0.75, while
 * frames from one burst scored 0.999. Reusing the text band here would report
 * two unrelated photos as a perfect match.
 */
export function imageImageRelevance(similarity: number): number {
  return rescale(similarity, 0.75, 1);
}

/**
 * Cosine similarity at or above which two photos are offered as "similar".
 * The 90th percentile of all pairs in the sample library was 0.94 and the
 * median 0.75, so this keeps genuinely related shots and drops the long tail.
 */
export const SIMILAR_IMAGE_THRESHOLD = 0.9;

/** Serialises an embedding for storage in a SQLite BLOB column. */
export function embeddingToBytes(vector: Float32Array): Uint8Array {
  const copy = vector instanceof Float32Array ? vector : Float32Array.from(vector);
  return new Uint8Array(copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength));
}

/**
 * Reads an embedding back out of a SQLite BLOB.
 * Returns null for anything that is not a complete vector, so a truncated or
 * corrupt row is skipped instead of poisoning the ranking.
 */
export function bytesToEmbedding(bytes: Uint8Array | ArrayBuffer | null | undefined): Float32Array | null {
  if (!bytes) return null;
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.byteLength !== EMBEDDING_BYTES) return null;
  // Copy into a fresh buffer: the source may be a view into a larger, reused
  // buffer whose byte offset is not 4-aligned.
  const aligned = new Uint8Array(view);
  return new Float32Array(aligned.buffer);
}

export type Scored<T> = { item: T; score: number };

/**
 * Ranks candidates by similarity to `query` and returns the best `limit`.
 * `minScore` is applied to the cosine value, before it is rescaled for display.
 */
export function rankBySimilarity<T>(
  query: Float32Array,
  candidates: { item: T; embedding: Float32Array | null }[],
  options: { limit?: number; minScore?: number } = {}
): Scored<T>[] {
  const minScore = options.minScore ?? -1;
  const scored: Scored<T>[] = [];

  for (const candidate of candidates) {
    if (!candidate.embedding) continue;
    const score = dot(query, candidate.embedding);
    if (score >= minScore) scored.push({ item: candidate.item, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return options.limit ? scored.slice(0, options.limit) : scored;
}

/** Mean of several unit vectors, renormalised — used to average label prompts. */
export function meanVector(vectors: Float32Array[]): Float32Array | null {
  if (!vectors.length) return null;
  const total = new Float32Array(vectors[0].length);
  for (const vector of vectors) {
    if (vector.length !== total.length) continue;
    for (let i = 0; i < vector.length; i += 1) total[i] += vector[i];
  }
  return normalise(total);
}
