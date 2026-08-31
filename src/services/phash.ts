/**
 * Perceptual hashing (160-bit fingerprint).
 *
 * Byte-identical duplicates are easy; the photos that actually waste space are
 * near-identical — the same shot taken three times, or a re-compressed copy that
 * came back through a chat app.
 *
 * The image is reduced to a 9×9 grid and three signatures are recorded:
 *
 *   1. **Tone** (64 bits) — is each cell brighter than the grid average?
 *   2. **Vertical gradient** (64 bits) — is each cell brighter than the one below?
 *   3. **Chroma** (32 bits) — is each quadrant-cell warm, and is it cool?
 *
 * Three deliberate departures from a textbook dHash, each fixing a failure seen
 * while testing:
 *
 * - The usual left-to-right difference pass is not used. On a picture whose
 *   detail runs horizontally — a landscape, a sunset, a sky — every left-to-right
 *   comparison is a near-tie, so those bits are decided by rounding noise and two
 *   frames of the same scene hash completely differently.
 * - The vertical pass is kept, because it is what locates the horizon.
 * - Chroma is compared against a fixed neutral point rather than the image's own
 *   average. A luminance-only hash cannot tell a teal photo from a purple one of
 *   the same scene, and normalising colour against the image mean would throw
 *   away exactly the global hue that distinguishes them.
 */

import { ImageManipulator, SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';

import { base64ToBytes, bitsToHex } from '@/lib/hash';

/** Grid side. 9 cells give 8 comparisons per row and per column. */
const GRID = 9;

/** Side of the coarse grid used for the colour signature. */
const CHROMA_GRID = 4;

/** Total bits in a fingerprint: 64 tone + 64 vertical + 32 chroma. */
export const HASH_BITS = 160;

/** Hex characters in a valid fingerprint. */
export const HASH_LENGTH = HASH_BITS / 4;

/**
 * Bumped whenever the hashing algorithm changes. Stored fingerprints from an
 * older version are cleared on startup so they are recomputed rather than
 * silently compared against hashes that mean something different.
 */
export const FINGERPRINT_VERSION = 3;

/** Stored instead of a hash when an image cannot be decoded at all. */
export const UNSUPPORTED = 'unsupported';

/** Downscales to a tiny JPEG and returns its base64 payload. */
async function renderThumbnail(uri: string): Promise<string | null> {
  const size = { width: GRID, height: GRID };
  try {
    const context = ImageManipulator.manipulate(uri);
    context.resize(size);
    const image = await context.renderAsync();
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 1, base64: true });
    return result.base64 ?? null;
  } catch {
    // Older runtimes still expose only the deprecated functional API.
    try {
      const result = await manipulateAsync(uri, [{ resize: size }], {
        format: SaveFormat.JPEG,
        compress: 1,
        base64: true,
      });
      return result.base64 ?? null;
    } catch {
      return null;
    }
  }
}

type Cell = {
  /** ITU-R BT.601 luma. */
  y: number;
  /** Blue-difference chroma, centred on zero. */
  cb: number;
  /** Red-difference chroma, centred on zero. */
  cr: number;
};

/**
 * Samples the decoded image into a GRID×GRID matrix of luma and chroma.
 * The encoder may not land on exactly the requested size, so cells are sampled
 * by ratio rather than assuming a 1:1 mapping.
 */
function toCellGrid(data: ArrayLike<number>, width: number, height: number): Cell[][] {
  const grid: Cell[][] = [];
  for (let row = 0; row < GRID; row += 1) {
    const y = Math.min(height - 1, Math.floor((row * height) / GRID));
    const cells: Cell[] = [];
    for (let column = 0; column < GRID; column += 1) {
      const x = Math.min(width - 1, Math.floor((column * width) / GRID));
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      cells.push({ y: luma, cb: b - luma, cr: r - luma });
    }
    grid.push(cells);
  }
  return grid;
}

/** How far from neutral a cell must be before it counts as warm or cool. */
const CHROMA_DEADZONE = 8;

/**
 * Computes the 40 hex character fingerprint for an image.
 * Returns null when the image cannot be decoded, so callers can skip it rather
 * than abort a whole batch.
 */
export async function computePerceptualHash(uri: string): Promise<string | null> {
  const base64 = await renderThumbnail(uri);
  if (!base64) return null;

  try {
    const bytes = base64ToBytes(base64);
    const decoded = decodeJpeg(bytes, { useTArray: true });
    if (!decoded?.data || !decoded.width || !decoded.height) return null;

    const grid = toCellGrid(decoded.data, decoded.width, decoded.height);
    const bits: number[] = [];
    const span = GRID - 1;

    // Mean luma of the 8×8 cells the tone pass looks at.
    let sum = 0;
    for (let row = 0; row < span; row += 1) {
      for (let column = 0; column < span; column += 1) sum += grid[row][column].y;
    }
    const mean = sum / (span * span);

    // 1. Tone: is each cell brighter than the image average?
    for (let row = 0; row < span; row += 1) {
      for (let column = 0; column < span; column += 1) {
        bits.push(grid[row][column].y > mean ? 1 : 0);
      }
    }

    // 2. Vertical gradient: is each cell brighter than the one below it?
    for (let column = 0; column < span; column += 1) {
      for (let row = 0; row < span; row += 1) {
        bits.push(grid[row][column].y > grid[row + 1][column].y ? 1 : 0);
      }
    }

    // 3. Chroma: two absolute bits per coarse cell — warm, and cool. A neutral
    //    cell sets neither, which is itself a distinguishing signal.
    const step = span / CHROMA_GRID;
    for (let row = 0; row < CHROMA_GRID; row += 1) {
      for (let column = 0; column < CHROMA_GRID; column += 1) {
        const cell = grid[Math.floor(row * step)][Math.floor(column * step)];
        bits.push(cell.cr > CHROMA_DEADZONE ? 1 : 0);
        bits.push(cell.cb > CHROMA_DEADZONE ? 1 : 0);
      }
    }

    return bits.length === HASH_BITS ? bitsToHex(bits) : null;
  } catch {
    return null;
  }
}
