import {
  EMBEDDING_BYTES,
  bytesToEmbedding,
  cosineSimilarity,
  dot,
  embeddingToBytes,
  magnitude,
  meanVector,
  normalise,
  rankBySimilarity,
  imageImageRelevance,
  textImageRelevance,
} from '@/lib/vector';

function vec(...values: number[]): Float32Array {
  return Float32Array.from(values);
}

describe('magnitude and normalise', () => {
  it('measures length', () => {
    expect(magnitude(vec(3, 4))).toBeCloseTo(5);
  });

  it('scales to unit length', () => {
    const unit = normalise(vec(3, 4));
    expect(magnitude(unit)).toBeCloseTo(1);
    expect(unit[0]).toBeCloseTo(0.6);
  });

  it('leaves a zero vector alone instead of producing NaN', () => {
    const zero = normalise(vec(0, 0, 0));
    expect([...zero]).toEqual([0, 0, 0]);
  });
});

describe('dot and cosineSimilarity', () => {
  it('computes a dot product', () => {
    expect(dot(vec(1, 2, 3), vec(4, 5, 6))).toBeCloseTo(32);
  });

  it('returns 0 for mismatched lengths rather than throwing', () => {
    expect(dot(vec(1, 2), vec(1, 2, 3))).toBe(0);
  });

  it('is 1 for identical directions and -1 for opposite', () => {
    expect(cosineSimilarity(vec(1, 0), vec(2, 0))).toBeCloseTo(1);
    expect(cosineSimilarity(vec(1, 0), vec(-1, 0))).toBeCloseTo(-1);
  });

  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity(vec(1, 0), vec(0, 1))).toBeCloseTo(0);
  });

  it('is 0 when either vector is empty', () => {
    expect(cosineSimilarity(vec(0, 0), vec(1, 1))).toBe(0);
  });
});

describe('relevance scoring', () => {
  it('rescales the text-to-image band', () => {
    expect(textImageRelevance(0.2)).toBeCloseTo(0);
    expect(textImageRelevance(0.31)).toBeCloseTo(1);
    expect(textImageRelevance(0.255)).toBeCloseTo(0.5);
  });

  it('rescales the much tighter image-to-image band', () => {
    expect(imageImageRelevance(0.75)).toBeCloseTo(0);
    expect(imageImageRelevance(1)).toBeCloseTo(1);
    // A pair of unrelated photos scores ~0.75 raw, which must not read as a match.
    expect(imageImageRelevance(0.75)).toBeLessThan(0.05);
  });

  it('clamps outside each band', () => {
    expect(textImageRelevance(-1)).toBe(0);
    expect(textImageRelevance(0.9)).toBe(1);
    expect(imageImageRelevance(0.1)).toBe(0);
    expect(imageImageRelevance(2)).toBe(1);
  });
});

describe('embedding serialisation', () => {
  it('round-trips through bytes', () => {
    const original = new Float32Array(512);
    for (let i = 0; i < original.length; i += 1) original[i] = Math.sin(i) / 2;
    const restored = bytesToEmbedding(embeddingToBytes(original));
    expect(restored).not.toBeNull();
    expect(restored!.length).toBe(512);
    for (let i = 0; i < original.length; i += 1) {
      expect(restored![i]).toBeCloseTo(original[i], 6);
    }
  });

  it('produces exactly one float32 per dimension', () => {
    expect(embeddingToBytes(new Float32Array(512)).byteLength).toBe(EMBEDDING_BYTES);
  });

  it('rejects a truncated blob instead of returning garbage', () => {
    expect(bytesToEmbedding(new Uint8Array(16))).toBeNull();
  });

  it('rejects null and undefined', () => {
    expect(bytesToEmbedding(null)).toBeNull();
    expect(bytesToEmbedding(undefined)).toBeNull();
  });

  it('reads a blob that is a non-aligned view into a larger buffer', () => {
    // SQLite drivers often hand back a view into a shared, reused buffer.
    const backing = new Uint8Array(EMBEDDING_BYTES + 3);
    const view = backing.subarray(3);
    expect(bytesToEmbedding(view)?.length).toBe(512);
  });
});

describe('rankBySimilarity', () => {
  const query = normalise(vec(1, 0, 0));
  const candidates = [
    { item: 'orthogonal', embedding: normalise(vec(0, 1, 0)) },
    { item: 'exact', embedding: normalise(vec(1, 0, 0)) },
    { item: 'close', embedding: normalise(vec(0.9, 0.1, 0)) },
    { item: 'missing', embedding: null },
  ];

  it('orders by descending similarity', () => {
    const ranked = rankBySimilarity(query, candidates);
    expect(ranked.map((r) => r.item)).toEqual(['exact', 'close', 'orthogonal']);
  });

  it('skips candidates with no embedding', () => {
    expect(rankBySimilarity(query, candidates).some((r) => r.item === 'missing')).toBe(false);
  });

  it('applies a minimum score', () => {
    const ranked = rankBySimilarity(query, candidates, { minScore: 0.5 });
    expect(ranked.map((r) => r.item)).toEqual(['exact', 'close']);
  });

  it('applies a limit', () => {
    expect(rankBySimilarity(query, candidates, { limit: 1 })).toHaveLength(1);
  });
});

describe('meanVector', () => {
  it('averages and renormalises', () => {
    const mean = meanVector([normalise(vec(1, 0)), normalise(vec(0, 1))]);
    expect(magnitude(mean!)).toBeCloseTo(1);
    expect(mean![0]).toBeCloseTo(mean![1]);
  });

  it('returns null for an empty list', () => {
    expect(meanVector([])).toBeNull();
  });
});
