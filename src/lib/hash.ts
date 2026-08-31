/** Bit utilities shared by the perceptual hash and the duplicate finder. */

/** Number of differing bits between two equal-length hex strings. */
export function hammingDistance(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    if (Number.isNaN(diff)) return Number.MAX_SAFE_INTEGER;
    // 4 bits per hex character.
    distance += ((diff >> 3) & 1) + ((diff >> 2) & 1) + ((diff >> 1) & 1) + (diff & 1);
  }
  return distance;
}

/** Packs an array of 0/1 values into a lowercase hex string. */
export function bitsToHex(bits: number[]): string {
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }
  return hex;
}

/** Number of set bits in a hex hash. */
export function countBits(hex: string): number {
  let bits = 0;
  for (const character of hex) {
    const nibble = parseInt(character, 16);
    if (Number.isNaN(nibble)) continue;
    bits += ((nibble >> 3) & 1) + ((nibble >> 2) & 1) + ((nibble >> 1) & 1) + (nibble & 1);
  }
  return bits;
}

/**
 * True when a hash carries too little variation to distinguish one image from
 * another. A smooth gradient or a flat colour produces a hash that is almost
 * all ones or almost all zeroes, and comparing two of those would report a
 * match between pictures that look nothing alike.
 */
export function isLowEntropyHash(hex: string, totalBits = 64): boolean {
  if (!hex) return true;
  const set = countBits(hex);
  const minority = Math.min(set, totalBits - set);
  return minority < totalBits * 0.125;
}

/** 0–1 similarity score derived from a hamming distance over `bits` bits. */
export function similarity(distance: number, bits = 64): number {
  if (distance === Number.MAX_SAFE_INTEGER) return 0;
  return Math.max(0, 1 - distance / bits);
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decodes base64 into bytes without relying on `atob`, which is not guaranteed
 * to exist on every React Native runtime.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const byteLength = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(byteLength);
  let byteIndex = 0;
  let buffer = 0;
  let bitsCollected = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const value = BASE64_ALPHABET.indexOf(clean[i]);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes[byteIndex] = (buffer >> bitsCollected) & 0xff;
      byteIndex += 1;
    }
  }
  return byteIndex === bytes.length ? bytes : bytes.slice(0, byteIndex);
}
