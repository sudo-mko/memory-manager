/**
 * Zero-shot visual tagging.
 *
 * CLIP puts images and text in one space, so an image can be labelled without
 * ever training a classifier: embed a set of candidate phrases, and whichever
 * sits closest to the picture is what the picture shows.
 *
 * The 113 label vectors are computed once, offline, and shipped with the app
 * (`assets/models/clip-labels.json`). That matters — it means visual tagging
 * needs only the 92 MB image encoder, not the 242 MB text encoder as well.
 *
 * Each label was embedded through four prompt templates and averaged, which is
 * the ensembling recipe from the CLIP paper and measurably steadier than a
 * single phrasing.
 */

import { base64ToBytes } from '@/lib/hash';
import { EMBEDDING_DIM } from '@/lib/vector';

/**
 * Thresholds calibrated against the bundled sample library, where correct
 * labels scored 0.25–0.30 and the median label scored 0.22. They are
 * intentionally conservative: a missing tag is a small annoyance, a confidently
 * wrong one undermines trust in every tag.
 */
const MAX_LABELS = 4;
/** A label must clear this cosine similarity to be considered at all. */
const SCORE_FLOOR = 0.235;
/** …and must be within this distance of the best-scoring label. */
const SCORE_MARGIN = 0.012;

type LabelAsset = {
  model: string;
  dim: number;
  labels: { prompt: string; tag: string }[];
  data: string;
};

type LabelBank = {
  tags: string[];
  /** All label vectors packed end to end: label `i` occupies [i*dim, (i+1)*dim). */
  matrix: Float32Array;
  count: number;
};

let cachedBank: LabelBank | null = null;

/**
 * Loads and decodes the label bank on first use.
 * The asset is a few hundred kilobytes, so it is deliberately not parsed at
 * module load — an install that never turns on smart tagging never pays for it.
 */
export function getLabelBank(): LabelBank {
  if (cachedBank) return cachedBank;

  const asset = require('@/assets/models/clip-labels.json') as LabelAsset;
  const bytes = base64ToBytes(asset.data);
  const aligned = new Uint8Array(bytes);
  const matrix = new Float32Array(aligned.buffer);

  cachedBank = {
    tags: asset.labels.map((label) => label.tag),
    matrix,
    count: asset.labels.length,
  };
  return cachedBank;
}

export type ScoredLabel = { tag: string; score: number };

/**
 * Scores every label against one image embedding.
 * Both sides are unit vectors, so the dot product *is* the cosine similarity.
 */
export function scoreLabels(embedding: Float32Array): ScoredLabel[] {
  const bank = getLabelBank();
  const scores: ScoredLabel[] = [];

  for (let label = 0; label < bank.count; label += 1) {
    const offset = label * EMBEDDING_DIM;
    let total = 0;
    for (let i = 0; i < EMBEDDING_DIM; i += 1) total += embedding[i] * bank.matrix[offset + i];
    scores.push({ tag: bank.tags[label], score: total });
  }

  return scores.sort((a, b) => b.score - a.score);
}

/**
 * Picks the labels worth keeping from a scored list.
 *
 * Pure, so the selection rule can be tested without the model or the asset.
 * Duplicate tags collapse to their best score — several prompts map to the same
 * user-facing tag (both "a person" and "a group of people" become `people`).
 */
export function selectLabels(
  scored: ScoredLabel[],
  options: { max?: number; floor?: number; margin?: number } = {}
): string[] {
  const max = options.max ?? MAX_LABELS;
  const floor = options.floor ?? SCORE_FLOOR;
  const margin = options.margin ?? SCORE_MARGIN;

  const best = new Map<string, number>();
  for (const entry of scored) {
    const previous = best.get(entry.tag);
    if (previous === undefined || entry.score > previous) best.set(entry.tag, entry.score);
  }

  const ranked = [...best.entries()]
    .map(([tag, score]) => ({ tag, score }))
    .sort((a, b) => b.score - a.score);

  if (!ranked.length || ranked[0].score < floor) return [];

  const cutoff = Math.max(floor, ranked[0].score - margin);
  return ranked
    .filter((entry) => entry.score >= cutoff)
    .slice(0, max)
    .map((entry) => entry.tag);
}

/** Convenience: embedding in, visual tags out. */
export function visualTagsFor(embedding: Float32Array): string[] {
  return selectLabels(scoreLabels(embedding));
}
