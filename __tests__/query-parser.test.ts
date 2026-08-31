import {
  describeQuery,
  parseDateBoundary,
  parseQuery,
  parseSize,
  tokenize,
} from '@/lib/query-parser';

describe('tokenize', () => {
  it('splits on whitespace', () => {
    expect(tokenize('beach sunset')).toEqual(['beach', 'sunset']);
  });

  it('keeps quoted phrases together', () => {
    expect(tokenize('"family dinner" beach')).toEqual(['"family dinner"', 'beach']);
  });

  it('ignores empty quotes and extra whitespace', () => {
    expect(tokenize('  "" beach   ')).toEqual(['beach']);
  });
});

describe('parseSize', () => {
  it.each([
    ['5mb', 5 * 1024 * 1024],
    ['900kb', 900 * 1024],
    ['2GB', 2 * 1024 * 1024 * 1024],
    ['1024', 1024],
  ])('parses %s', (input, expected) => {
    expect(parseSize(input)).toBe(expected);
  });

  it('rejects nonsense', () => {
    expect(parseSize('big')).toBeNull();
  });
});

describe('parseDateBoundary', () => {
  it('expands a year to the whole year', () => {
    const range = parseDateBoundary('2024');
    expect(range).not.toBeNull();
    expect(new Date(range!.start).getFullYear()).toBe(2024);
    expect(new Date(range!.end).getFullYear()).toBe(2025);
  });

  it('expands a month to the whole month', () => {
    const range = parseDateBoundary('2024-05');
    expect(new Date(range!.start).getMonth()).toBe(4);
    expect(new Date(range!.end).getMonth()).toBe(5);
  });

  it('rejects an impossible month', () => {
    expect(parseDateBoundary('2024-13')).toBeNull();
  });
});

describe('parseQuery', () => {
  it('treats an empty string as no constraints', () => {
    expect(parseQuery('   ').isEmpty).toBe(true);
  });

  it('collects free text terms in lowercase', () => {
    expect(parseQuery('Beach Sunset').terms).toEqual(['beach', 'sunset']);
  });

  it('handles negated terms', () => {
    const parsed = parseQuery('beach -whatsapp');
    expect(parsed.terms).toEqual(['beach']);
    expect(parsed.excluded).toEqual(['whatsapp']);
  });

  it('reads tag, album and flag operators', () => {
    const parsed = parseQuery('tag:Receipts album:Camera is:screenshot');
    expect(parsed.tags).toEqual(['receipts']);
    expect(parsed.albums).toEqual(['camera']);
    expect(parsed.flags).toEqual(['screenshot']);
  });

  it('negates tags and flags', () => {
    const parsed = parseQuery('-tag:meme -is:video');
    expect(parsed.excludedTags).toEqual(['meme']);
    expect(parsed.excludedFlags).toEqual(['video']);
  });

  it('reads dimension and size comparisons', () => {
    const parsed = parseQuery('w>2000 h<=500 size>5mb');
    expect(parsed.width).toEqual({ op: '>', value: 2000 });
    expect(parsed.height).toEqual({ op: '<=', value: 500 });
    expect(parsed.size).toEqual({ op: '>', value: 5 * 1024 * 1024 });
  });

  it('turns year: into a bounded range', () => {
    const parsed = parseQuery('year:2024');
    expect(parsed.after).toBeDefined();
    expect(parsed.before).toBeDefined();
    expect(parsed.before! > parsed.after!).toBe(true);
  });

  it('degrades an unknown operator into free text rather than throwing', () => {
    const parsed = parseQuery('colour:red');
    expect(parsed.terms).toEqual(['colour:red']);
    expect(parsed.isEmpty).toBe(false);
  });

  it('degrades a malformed date into free text', () => {
    const parsed = parseQuery('after:soon');
    expect(parsed.after).toBeUndefined();
    expect(parsed.terms).toEqual(['after:soon']);
  });

  it('keeps a quoted phrase as one term', () => {
    expect(parseQuery('"family dinner"').terms).toEqual(['family dinner']);
  });

  it('parses a realistic combined query', () => {
    const parsed = parseQuery('is:screenshot after:2025-01 -tag:meme w>1000 receipt');
    expect(parsed.flags).toEqual(['screenshot']);
    expect(parsed.excludedTags).toEqual(['meme']);
    expect(parsed.width).toEqual({ op: '>', value: 1000 });
    expect(parsed.terms).toEqual(['receipt']);
  });
});

describe('describeQuery', () => {
  it('describes an empty query', () => {
    expect(describeQuery(parseQuery(''))).toBe('Everything in your index');
  });

  it('mentions each active constraint', () => {
    const description = describeQuery(parseQuery('tag:receipt is:screenshot w>100'));
    expect(description).toContain('receipt');
    expect(description).toContain('screenshot');
    expect(description).toContain('dimensions');
  });
});
