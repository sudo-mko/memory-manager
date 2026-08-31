import {
  formatBytes,
  formatCount,
  formatDimensions,
  formatDuration,
  formatMegapixels,
  formatRelative,
  monthKey,
  normaliseTag,
  parseTagList,
} from '@/lib/format';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1536, '1.5 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
  ])('formats %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });

  it('handles unknown sizes', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(undefined)).toBe('—');
  });
});

describe('dimension helpers', () => {
  it('formats dimensions', () => {
    expect(formatDimensions(1920, 1080)).toBe('1920 × 1080');
    expect(formatDimensions(0, 1080)).toBe('—');
  });

  it('formats megapixels', () => {
    expect(formatMegapixels(4000, 3000)).toBe('12 MP');
    expect(formatMegapixels(1000, 1000)).toBe('1.0 MP');
  });
});

describe('formatDuration', () => {
  it('pads seconds', () => {
    expect(formatDuration(65)).toBe('1:05');
  });

  it('returns empty for non-videos', () => {
    expect(formatDuration(0)).toBe('');
  });
});

describe('formatRelative', () => {
  const now = new Date(2025, 0, 10, 12, 0, 0).getTime();

  it.each([
    [now - 30_000, 'just now'],
    [now - 5 * 60_000, '5m ago'],
    [now - 3 * 3_600_000, '3h ago'],
    [now - 4 * 86_400_000, '4d ago'],
  ])('describes %s', (input, expected) => {
    expect(formatRelative(input, now)).toBe(expected);
  });
});

describe('formatCount', () => {
  it('adds thousands separators', () => {
    expect(formatCount(1204)).toBe('1,204');
    expect(formatCount(1_000_000)).toBe('1,000,000');
    expect(formatCount(7)).toBe('7');
  });
});

describe('monthKey', () => {
  it('zero-pads the month', () => {
    expect(monthKey(new Date(2025, 2, 15).getTime())).toBe('2025-03');
  });
});

describe('tag helpers', () => {
  it('parses and trims a tag blob', () => {
    expect(parseTagList('beach, sun ,,')).toEqual(['beach', 'sun']);
    expect(parseTagList(null)).toEqual([]);
  });

  it('normalises user input', () => {
    expect(normaliseTag('  Family Dinner ')).toBe('family-dinner');
    // Accented characters and punctuation are dropped, not transliterated.
    expect(normaliseTag('Réçeipts!')).toBe('reipts');
    expect(normaliseTag('   ')).toBe('');
  });

  it('caps very long tags', () => {
    expect(normaliseTag('a'.repeat(100)).length).toBe(32);
  });
});
