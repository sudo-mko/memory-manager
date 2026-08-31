import {
  base64ToBytes,
  bitsToHex,
  countBits,
  hammingDistance,
  isLowEntropyHash,
  similarity,
} from '@/lib/hash';

describe('bitsToHex', () => {
  it('packs four bits per hex character', () => {
    expect(bitsToHex([1, 0, 1, 0])).toBe('a');
    expect(bitsToHex([0, 0, 0, 0, 1, 1, 1, 1])).toBe('0f');
  });
});

describe('hammingDistance', () => {
  it('is zero for identical hashes', () => {
    expect(hammingDistance('ffff', 'ffff')).toBe(0);
  });

  it('counts differing bits', () => {
    expect(hammingDistance('0', '1')).toBe(1);
    expect(hammingDistance('0', 'f')).toBe(4);
    expect(hammingDistance('00', 'ff')).toBe(8);
  });

  it('refuses to compare mismatched lengths', () => {
    expect(hammingDistance('ff', 'f')).toBe(Number.MAX_SAFE_INTEGER);
    expect(hammingDistance('', 'f')).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('similarity', () => {
  it('maps distance onto a 0-1 score', () => {
    expect(similarity(0)).toBe(1);
    expect(similarity(64)).toBe(0);
    expect(similarity(32)).toBeCloseTo(0.5);
  });

  it('treats an incomparable distance as no similarity', () => {
    expect(similarity(Number.MAX_SAFE_INTEGER)).toBe(0);
  });
});

describe('countBits', () => {
  it('counts set bits across a hex hash', () => {
    expect(countBits('0000000000000000')).toBe(0);
    expect(countBits('ffffffffffffffff')).toBe(64);
    expect(countBits('f0')).toBe(4);
  });
});

describe('isLowEntropyHash', () => {
  it('rejects a hash that is all ones or all zeroes', () => {
    // A flat colour or smooth gradient produces these, and comparing two of
    // them would report a match between unrelated images.
    expect(isLowEntropyHash('ffffffffffffffff')).toBe(true);
    expect(isLowEntropyHash('0000000000000000')).toBe(true);
  });

  it('rejects a near-uniform hash', () => {
    expect(isLowEntropyHash('fffffffffffffff0')).toBe(true);
  });

  it('accepts a hash with real variation', () => {
    expect(isLowEntropyHash('f0f0f0f0f0f0f0f0')).toBe(false);
    expect(isLowEntropyHash('a3c19f4b2e8d7061')).toBe(false);
  });

  it('treats an empty hash as unusable', () => {
    expect(isLowEntropyHash('')).toBe(true);
  });
});

describe('base64ToBytes', () => {
  it('decodes ASCII', () => {
    expect(Array.from(base64ToBytes('SGk='))).toEqual([72, 105]);
  });

  it('decodes bytes above 127', () => {
    expect(Array.from(base64ToBytes('/w=='))).toEqual([255]);
  });

  it('ignores whitespace and padding noise', () => {
    expect(Array.from(base64ToBytes('S G k ='))).toEqual([72, 105]);
  });
});
