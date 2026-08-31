/**
 * Integration checks against the real bundled CLIP assets.
 *
 * These decode the shipped label bank and the precomputed sample-library
 * embeddings and assert that recognition actually works — catching a broken
 * base64 decode, a wrong matrix stride, or a regenerated asset that no longer
 * matches the model, none of which the pure unit tests would notice.
 */

import { base64ToBytes } from '@/lib/hash';
import { EMBEDDING_DIM, SIMILAR_IMAGE_THRESHOLD, magnitude, rankBySimilarity } from '@/lib/vector';
import { DEMO_ASSET_COUNT, demoAssetsByFilename } from '@/services/demo-library';
import { getLabelBank, scoreLabels, visualTagsFor } from '@/services/zero-shot';

const demoAsset = require('@/assets/models/demo-embeddings.json') as {
  model: string;
  dim: number;
  files: string[];
  data: string;
};

function demoEmbeddings(): Map<string, Float32Array> {
  const bytes = new Uint8Array(base64ToBytes(demoAsset.data));
  const all = new Float32Array(bytes.buffer);
  const map = new Map<string, Float32Array>();
  demoAsset.files.forEach((file, index) => {
    map.set(file, all.slice(index * EMBEDDING_DIM, (index + 1) * EMBEDDING_DIM));
  });
  return map;
}

describe('bundled CLIP assets', () => {
  it('ships both assets from the same model', () => {
    expect(demoAsset.model).toBe('openai/clip-vit-base-patch32');
    expect(demoAsset.dim).toBe(EMBEDDING_DIM);
  });

  it('decodes one unit vector per sample photo', () => {
    const embeddings = demoEmbeddings();
    expect(embeddings.size).toBe(demoAsset.files.length);
    for (const [file, vector] of embeddings) {
      expect(vector.length).toBe(EMBEDDING_DIM);
      expect(magnitude(vector)).toBeCloseTo(1, 4);
      expect(file.endsWith('.png')).toBe(true);
    }
  });

  it('decodes the label bank as unit vectors', () => {
    const bank = getLabelBank();
    expect(bank.count).toBeGreaterThan(50);
    expect(bank.matrix.length).toBe(bank.count * EMBEDDING_DIM);
    const first = bank.matrix.slice(0, EMBEDDING_DIM);
    expect(magnitude(first)).toBeCloseTo(1, 4);
  });
});

describe('zero-shot recognition on the sample library', () => {
  const embeddings = demoEmbeddings();

  it.each([
    ['Screenshot_20250612-193045.png', 'screenshot'],
    ['Screenshot_20250701-140900.png', 'screenshot'],
    ['selfie_20250509_2201.jpg.png', 'people'],
  ])('tags %s with %s', (file, expectedTag) => {
    const tags = visualTagsFor(embeddings.get(file)!);
    expect(tags).toContain(expectedTag);
  });

  it('recognises the sunrise photos as outdoor scenery, not as screenshots', () => {
    const tags = visualTagsFor(embeddings.get('IMG_20240712_083214.jpg.png')!);
    expect(tags.some((tag) => ['sunrise', 'sunset', 'field', 'grass'].includes(tag))).toBe(true);
    expect(tags).not.toContain('screenshot');
  });

  it('scores every label and returns them best first', () => {
    const scored = scoreLabels(embeddings.get('selfie_20250509_2201.jpg.png')!);
    expect(scored.length).toBe(getLabelBank().count);
    for (let i = 1; i < scored.length; i += 1) {
      expect(scored[i - 1].score).toBeGreaterThanOrEqual(scored[i].score);
    }
  });
});

describe('image-to-image similarity on the sample library', () => {
  const embeddings = demoEmbeddings();

  it('ranks a burst of the same scene above unrelated photos', () => {
    const query = embeddings.get('IMG_20240712_083214.jpg.png')!;
    const candidates = [...embeddings.entries()]
      .filter(([file]) => file !== 'IMG_20240712_083214.jpg.png')
      .map(([file, embedding]) => ({ item: file, embedding }));

    const ranked = rankBySimilarity(query, candidates, { limit: 2 });
    expect(ranked.map((r) => r.item).sort()).toEqual([
      'IMG_20240712_083250.jpg.png',
      'IMG_20240712_083311.jpg.png',
    ]);
    expect(ranked[0].score).toBeGreaterThan(0.9);
  });

  it('separates an unrelated photo from a true burst by a wide margin', () => {
    // Image embeddings occupy a narrow cone, so even unrelated photos score
    // around 0.75. What matters is the gap, not the absolute number.
    const landscape = embeddings.get('IMG_20240712_083214.jpg.png')!;
    const burst = embeddings.get('IMG_20240712_083250.jpg.png')!;
    const screenshot = embeddings.get('Screenshot_20250612-193045.png')!;

    const [burstScore] = rankBySimilarity(landscape, [{ item: 'burst', embedding: burst }]);
    const [otherScore] = rankBySimilarity(landscape, [{ item: 'shot', embedding: screenshot }]);

    expect(burstScore.score).toBeGreaterThan(SIMILAR_IMAGE_THRESHOLD);
    expect(otherScore.score).toBeLessThan(SIMILAR_IMAGE_THRESHOLD);
    expect(burstScore.score - otherScore.score).toBeGreaterThan(0.25);
  });
});

describe('sample library embedding coverage', () => {
  it('has a shipped embedding for every bundled photo', () => {
    // Guards against regenerating one asset without the other, which would
    // silently leave part of the sample library unsearchable.
    const byFile = demoAssetsByFilename();
    const unmatched = demoAsset.files.filter((file) => !byFile.has(file));
    expect(unmatched).toEqual([]);
    expect(demoAsset.files.length).toBe(DEMO_ASSET_COUNT);
  });
});
