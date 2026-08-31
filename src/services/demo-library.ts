/**
 * Bundled demo library.
 *
 * A marker (or anyone trying the app on a fresh emulator) should be able to see
 * every feature working within seconds, without granting photo permissions or
 * having a single picture on the device. Seeding writes these bundled assets
 * through exactly the same pipeline as real device photos - the same auto
 * tagger, the same upsert, the same index - so nothing here is a special case.
 */

import { Asset } from 'expo-asset';

import { pruneMissing, setEmbedding, upsertPhotos, type PhotoInput } from '@/db/photos';
import { base64ToBytes } from '@/lib/hash';
import { EMBEDDING_DIM } from '@/lib/vector';
import { deriveAutoTags } from '@/services/auto-tag';
import { visualTagsFor } from '@/services/zero-shot';

/** One bundled asset plus the metadata a real photo would carry. */
type DemoAsset = {
  module: number;
  filename: string;
  album: string;
  width: number;
  height: number;
  bytes: number;
  /** Local capture time, matching the date encoded in the filename. */
  date: string;
  video: boolean;
  duration: number;
};

export const DEMO_SOURCE = 'demo' as const;

const DEMO_ASSETS: DemoAsset[] = [
  {
    module: require('@/assets/demo/IMG_20240712_083214.jpg.png'),
    filename: 'IMG_20240712_083214.jpg',
    album: 'Camera',
    width: 900,
    height: 675,
    bytes: 174561,
    date: '2024-07-12T08:32:14',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/IMG_20240712_083250.jpg.png'),
    filename: 'IMG_20240712_083250.jpg',
    album: 'Camera',
    width: 900,
    height: 675,
    bytes: 174795,
    date: '2024-07-12T08:32:50',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/IMG_20240712_083311.jpg.png'),
    filename: 'IMG_20240712_083311.jpg',
    album: 'Camera',
    width: 900,
    height: 675,
    bytes: 177221,
    date: '2024-07-12T08:33:11',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/IMG_20240301_171002.jpg.png'),
    filename: 'IMG_20240301_171002.jpg',
    album: 'Camera',
    width: 900,
    height: 1200,
    bytes: 324147,
    date: '2024-03-01T17:10:02',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/IMG_20231118_142330.jpg.png'),
    filename: 'IMG_20231118_142330.jpg',
    album: 'Camera',
    width: 1200,
    height: 900,
    bytes: 320403,
    date: '2023-11-18T14:23:30',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/IMG_20250204_095512.jpg.png'),
    filename: 'IMG_20250204_095512.jpg',
    album: 'Camera',
    width: 1200,
    height: 900,
    bytes: 33930,
    date: '2025-02-04T09:55:12',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/PXL_20250620_121540.jpg.png'),
    filename: 'PXL_20250620_121540.jpg',
    album: 'Camera',
    width: 1600,
    height: 1200,
    bytes: 512004,
    date: '2025-06-20T12:15:40',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/PXL_20250620_121602.jpg.png'),
    filename: 'PXL_20250620_121602.jpg',
    album: 'Camera',
    width: 1600,
    height: 1200,
    bytes: 522798,
    date: '2025-06-20T12:16:02',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/Screenshot_20250612-193045.png'),
    filename: 'Screenshot_20250612-193045.png',
    album: 'Screenshots',
    width: 720,
    height: 1520,
    bytes: 16325,
    date: '2025-06-12T19:30:45',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/Screenshot_20250612-193112.png'),
    filename: 'Screenshot_20250612-193112.png',
    album: 'Screenshots',
    width: 720,
    height: 1520,
    bytes: 16325,
    date: '2025-06-12T19:31:12',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/Screenshot_20250408-081233.png'),
    filename: 'Screenshot_20250408-081233.png',
    album: 'Screenshots',
    width: 720,
    height: 1520,
    bytes: 17496,
    date: '2025-04-08T08:12:33',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/Screenshot_20240922-224417.png'),
    filename: 'Screenshot_20240922-224417.png',
    album: 'Screenshots',
    width: 720,
    height: 1520,
    bytes: 17497,
    date: '2024-09-22T22:44:17',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/Screenshot_20250701-140900.png'),
    filename: 'Screenshot_20250701-140900.png',
    album: 'Screenshots',
    width: 1080,
    height: 2160,
    bytes: 28460,
    date: '2025-07-01T14:09:00',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/receipt_grocery_march.jpg.png'),
    filename: 'receipt_grocery_march.jpg',
    album: 'Documents',
    width: 760,
    height: 1100,
    bytes: 10055,
    date: '2025-03-14T11:02:00',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/invoice_2025_0042.jpg.png'),
    filename: 'invoice_2025_0042.jpg',
    album: 'Documents',
    width: 760,
    height: 1100,
    bytes: 9958,
    date: '2025-05-06T16:40:00',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/scan_passport_copy.jpg.png'),
    filename: 'scan_passport_copy.jpg',
    album: 'Documents',
    width: 1100,
    height: 760,
    bytes: 8753,
    date: '2024-12-02T10:15:00',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/IMG-20250115-WA0031.jpg.png'),
    filename: 'IMG-20250115-WA0031.jpg',
    album: 'WhatsApp Images',
    width: 800,
    height: 800,
    bytes: 164849,
    date: '2025-01-15T20:11:00',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/IMG-20250115-WA0032.jpg.png'),
    filename: 'IMG-20250115-WA0032.jpg',
    album: 'WhatsApp Images',
    width: 800,
    height: 800,
    bytes: 180584,
    date: '2025-01-15T20:12:00',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/IMG-20241203-WA0007.jpg.png'),
    filename: 'IMG-20241203-WA0007.jpg',
    album: 'WhatsApp Images',
    width: 1000,
    height: 750,
    bytes: 168514,
    date: '2024-12-03T09:05:00',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/selfie_20250509_2201.jpg.png'),
    filename: 'selfie_20250509_2201.jpg',
    album: 'Camera',
    width: 900,
    height: 1200,
    bytes: 393798,
    date: '2025-05-09T22:01:00',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/PANO_20240817_163055.jpg.png'),
    filename: 'PANO_20240817_163055.jpg',
    album: 'Camera',
    width: 2000,
    height: 700,
    bytes: 411529,
    date: '2024-08-17T16:30:55',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/wallpaper_abstract_dark.png'),
    filename: 'wallpaper_abstract_dark.png',
    album: 'Download',
    width: 1080,
    height: 1920,
    bytes: 74292,
    date: '2024-10-27T13:00:00',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/VID_20250330_190210.mp4.png'),
    filename: 'VID_20250330_190210.mp4',
    album: 'Camera',
    width: 1080,
    height: 1920,
    bytes: 479635,
    date: '2025-03-30T19:02:10',
    video: true,
    duration: 18.4,
  },
  {
    module: require('@/assets/demo/VID_20241224_205544.mp4.png'),
    filename: 'VID_20241224_205544.mp4',
    album: 'Camera',
    width: 1920,
    height: 1080,
    bytes: 57146,
    date: '2024-12-24T20:55:44',
    video: true,
    duration: 47.2,
  },
  {
    module: require('@/assets/demo/meme_cat_keyboard.jpg.png'),
    filename: 'meme_cat_keyboard.jpg',
    album: 'Download',
    width: 700,
    height: 700,
    bytes: 107322,
    date: '2025-02-19T21:33:00',
    video: false,
    duration: 0,
  },
  {
    module: require('@/assets/demo/qr_code_event_pass.png'),
    filename: 'qr_code_event_pass.png',
    album: 'Download',
    width: 600,
    height: 600,
    bytes: 5542,
    date: '2025-07-22T08:45:00',
    video: false,
    duration: 0,
  },
];

/** Total number of bundled demo assets - shown in Settings. */
export const DEMO_ASSET_COUNT = DEMO_ASSETS.length;

function parseLocalDate(value: string): number {
  const [datePart, timePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, second).getTime();
}

/**
 * Seeds (or refreshes) the demo photos in the index.
 * Returns the number of rows written.
 */
export async function seedDemoLibrary(): Promise<number> {
  // `loadAsync` unpacks the bundled files and hands back a URI the image
  // component can render, both in development and in a release build.
  const assets = await Asset.loadAsync(DEMO_ASSETS.map((asset) => asset.module));

  const inputs: PhotoInput[] = DEMO_ASSETS.map((demo, index) => {
    const resolved = assets[index];
    const createdAt = parseLocalDate(demo.date);
    const mediaType = demo.video ? ('video' as const) : ('photo' as const);

    return {
      id: `demo:${demo.filename}`,
      uri: resolved.localUri ?? resolved.uri,
      filename: demo.filename,
      mediaType,
      width: demo.width,
      height: demo.height,
      duration: demo.duration,
      fileSize: demo.bytes,
      createdAt,
      modifiedAt: createdAt,
      albumName: demo.album,
      source: DEMO_SOURCE,
      autoTags: deriveAutoTags({
        filename: demo.filename,
        albumName: demo.album,
        width: demo.width,
        height: demo.height,
        mediaType,
        createdAt,
        fileSize: demo.bytes,
      }),
    };
  });

  const written = await upsertPhotos(inputs);
  await applyDemoEmbeddings();
  return written;
}

type DemoEmbeddingAsset = { model: string; dim: number; files: string[]; data: string };

/**
 * Attaches the precomputed CLIP embeddings that ship with the sample library.
 *
 * These were generated offline with the same `openai/clip-vit-base-patch32`
 * weights the app loads at runtime, so they live in exactly the same vector
 * space as anything encoded on device. Shipping them means the demo library is
 * semantically searchable and visually tagged the instant it is switched on —
 * no model download, no waiting, and it works with the device in flight mode.
 */
async function applyDemoEmbeddings(): Promise<void> {
  try {
    const asset = require('@/assets/models/demo-embeddings.json') as DemoEmbeddingAsset;
    if (asset.dim !== EMBEDDING_DIM) return;

    const bytes = new Uint8Array(base64ToBytes(asset.data));
    const all = new Float32Array(bytes.buffer);
    const byFile = demoAssetsByFilename();

    for (let index = 0; index < asset.files.length; index += 1) {
      const demo = byFile.get(asset.files[index]);
      if (!demo) continue;
      const embedding = all.slice(index * EMBEDDING_DIM, (index + 1) * EMBEDDING_DIM);
      await setEmbedding(`demo:${demo.filename}`, embedding, visualTagsFor(embedding));
    }
  } catch {
    // The sample library is still perfectly usable without its embeddings;
    // smart search simply has nothing precomputed to work with.
  }
}

/**
 * Indexes the demo assets by the filename they have *on disk*.
 *
 * The embedding asset is keyed by the real file, which keeps its double
 * extension (`IMG_1234.jpg.png`), while the entry's `filename` is the display
 * name shown to the user (`IMG_1234.jpg`). Exported so a test can assert every
 * shipped embedding finds its photo.
 */
export function demoAssetsByFilename(): Map<string, DemoAsset> {
  const map = new Map<string, DemoAsset>();
  for (const demo of DEMO_ASSETS) {
    map.set(demo.filename, demo);
    map.set(`${demo.filename}.png`, demo);
  }
  return map;
}

/** Removes every demo row, leaving real device photos untouched. */
export async function removeDemoLibrary(): Promise<number> {
  return pruneMissing(new Set<string>(), DEMO_SOURCE);
}
