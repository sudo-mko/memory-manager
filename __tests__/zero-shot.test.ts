import { selectLabels, type ScoredLabel } from '@/services/zero-shot';

function labels(...pairs: [string, number][]): ScoredLabel[] {
  return pairs.map(([tag, score]) => ({ tag, score }));
}

describe('selectLabels', () => {
  it('keeps the confident cluster at the top', () => {
    // Mirrors a real sunrise photo from the sample library.
    const chosen = selectLabels(
      labels(['grass', 0.285], ['sunset', 0.282], ['sunrise', 0.281], ['desert', 0.262], ['a cat', 0.21])
    );
    expect(chosen).toEqual(['grass', 'sunset', 'sunrise']);
  });

  it('keeps a single dominant label when nothing else is close', () => {
    const chosen = selectLabels(labels(['screenshot', 0.285], ['music', 0.26], ['chart', 0.253]));
    expect(chosen).toEqual(['screenshot']);
  });

  it('returns nothing when even the best label is weak', () => {
    expect(selectLabels(labels(['cat', 0.19], ['dog', 0.18]))).toEqual([]);
  });

  it('never exceeds the maximum', () => {
    const tied = labels(['a', 0.3], ['b', 0.3], ['c', 0.3], ['d', 0.3], ['e', 0.3], ['f', 0.3]);
    expect(selectLabels(tied)).toHaveLength(4);
  });

  it('collapses duplicate tags to their best score', () => {
    // Several prompts map onto one user-facing tag.
    const chosen = selectLabels(labels(['people', 0.24], ['people', 0.29], ['portrait', 0.285]));
    expect(chosen).toEqual(['people', 'portrait']);
  });

  it('honours overridden thresholds', () => {
    const scored = labels(['a', 0.30], ['b', 0.20]);
    expect(selectLabels(scored, { floor: 0.1, margin: 0.5 })).toEqual(['a', 'b']);
    expect(selectLabels(scored, { floor: 0.35 })).toEqual([]);
  });

  it('handles an empty list', () => {
    expect(selectLabels([])).toEqual([]);
  });
});
