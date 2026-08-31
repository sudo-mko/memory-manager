/**
 * End-to-end check of the text-to-image ranking path.
 *
 * The model itself cannot run under Jest, so this uses real CLIP text vectors
 * generated offline from the same `openai/clip-vit-base-patch32` weights the
 * app loads at runtime. Everything after the model — ranking, thresholding and
 * the relevance rescale — is exactly the code that runs in the app, so a
 * regression in any of it fails here.
 */

import { base64ToBytes } from '@/lib/hash';
import { EMBEDDING_DIM, rankBySimilarity, textImageRelevance } from '@/lib/vector';

type Packed = { model: string; dim: number; data: string };

function unpack(asset: Packed, count: number): Float32Array[] {
  const bytes = new Uint8Array(base64ToBytes(asset.data));
  const all = new Float32Array(bytes.buffer);
  return Array.from({ length: count }, (_, i) =>
    all.slice(i * EMBEDDING_DIM, (i + 1) * EMBEDDING_DIM)
  );
}

const queryAsset = require('./fixtures/query-embeddings.json') as Packed & { phrases: string[] };
const demoAsset = require('@/assets/models/demo-embeddings.json') as Packed & { files: string[] };

const queries = new Map(
  unpack(queryAsset, queryAsset.phrases.length).map((vector, i) => [queryAsset.phrases[i], vector])
);
const photos = unpack(demoAsset, demoAsset.files.length).map((embedding, i) => ({
  item: demoAsset.files[i],
  embedding,
}));

function topFor(phrase: string, limit = 3): string[] {
  return rankBySimilarity(queries.get(phrase)!, photos, { limit }).map((hit) => hit.item);
}

describe('searching the sample library by meaning', () => {
  it('was generated from the same model the app runs', () => {
    expect(queryAsset.model).toBe(demoAsset.model);
    expect(queryAsset.dim).toBe(EMBEDDING_DIM);
  });

  it('finds the sunrise photos from "a sunset over a green field"', () => {
    const top = topFor('a sunset over a green field');
    expect(top.every((file) => file.startsWith('IMG_20240712'))).toBe(true);
  });

  it('finds screenshots from "a screenshot of a mobile phone app"', () => {
    const top = topFor('a screenshot of a mobile phone app');
    expect(top.every((file) => file.startsWith('Screenshot_'))).toBe(true);
  });

  it('finds paperwork from "a scanned document with printed text"', () => {
    const top = topFor('a scanned document with printed text');
    expect(top.some((file) => file.includes('receipt'))).toBe(true);
    expect(top.some((file) => file.includes('scan_passport') || file.includes('invoice'))).toBe(true);
  });

  it('finds the selfie from "a selfie of a person"', () => {
    expect(topFor('a selfie of a person', 1)).toEqual(['selfie_20250509_2201.jpg.png']);
  });

  it('does not return a landscape for a screenshot query', () => {
    const top = topFor('a screenshot of a mobile phone app', 5);
    expect(top.some((file) => file.startsWith('IMG_20240712'))).toBe(false);
  });

  it('scores a matching photo far above a mismatched one', () => {
    const query = queries.get('a selfie of a person')!;
    const selfie = photos.find((p) => p.item.startsWith('selfie'))!;
    const document = photos.find((p) => p.item.startsWith('receipt'))!;

    const [match] = rankBySimilarity(query, [selfie]);
    const [mismatch] = rankBySimilarity(query, [document]);

    expect(match.score).toBeGreaterThan(mismatch.score);
    expect(textImageRelevance(match.score)).toBeGreaterThan(textImageRelevance(mismatch.score));
  });

  it('keeps every raw similarity inside the calibrated band', () => {
    // Guards the relevance rescale: if CLIP similarities ever moved outside
    // 0.15–0.40, the 0–100% shown to the user would be meaningless.
    for (const query of queries.values()) {
      for (const { score } of rankBySimilarity(query, photos)) {
        expect(score).toBeGreaterThan(0.15);
        expect(score).toBeLessThan(0.4);
      }
    }
  });
});
