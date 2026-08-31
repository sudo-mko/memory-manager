/**
 * Sift search language.
 *
 * A tiny query DSL that turns a single text field into a precise filter.
 * Everything here is pure so it can be unit tested without a database.
 *
 *   beach sunset            two free-text terms (AND)
 *   "family dinner"         quoted phrase
 *   -whatsapp               exclude anything matching "whatsapp"
 *   tag:receipts            has the tag `receipts`
 *   album:Camera            lives in the album `Camera`
 *   is:screenshot           smart flag (see IS_FLAGS)
 *   after:2024-01  before:2025-03-01
 *   year:2024   month:2024-05
 *   w>2000  h<=500          pixel dimension comparisons
 *   size>5mb                file size comparison (b/kb/mb/gb)
 */

export type Comparison = { op: '>' | '<' | '>=' | '<=' | '='; value: number };

export const IS_FLAGS = [
  'screenshot',
  'selfie',
  'video',
  'photo',
  'favorite',
  'untagged',
  'large',
  'panorama',
  'square',
  'portrait',
  'landscape',
  'edited',
  'text',
  'encoded',
] as const;

export type IsFlag = (typeof IS_FLAGS)[number];

export type ParsedQuery = {
  /** Free text terms that must all match. */
  terms: string[];
  /** Free text terms that must not match. */
  excluded: string[];
  tags: string[];
  excludedTags: string[];
  albums: string[];
  /** Smart flags such as `is:screenshot`. */
  flags: IsFlag[];
  excludedFlags: IsFlag[];
  /** Inclusive lower bound (ms since epoch). */
  after?: number;
  /** Exclusive upper bound (ms since epoch). */
  before?: number;
  width?: Comparison;
  height?: Comparison;
  size?: Comparison;
  /** True when the query has no constraints at all. */
  isEmpty: boolean;
};

const EMPTY: ParsedQuery = {
  terms: [],
  excluded: [],
  tags: [],
  excludedTags: [],
  albums: [],
  flags: [],
  excludedFlags: [],
  isEmpty: true,
};

/** Splits on whitespace but keeps "quoted phrases" together. */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    // A quoted phrase keeps a marker so a later stage knows not to re-split it.
    if (match[1] !== undefined) {
      if (match[1].trim()) tokens.push(`"${match[1].trim()}"`);
    } else if (match[2]) {
      tokens.push(match[2]);
    }
  }
  return tokens;
}

/**
 * Parses `2024`, `2024-05` or `2024-05-17` into a [start, end) range in ms.
 * Returns null when the value is not a recognisable date.
 */
export function parseDateBoundary(value: string): { start: number; end: number } | null {
  const ymd = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(value.trim());
  if (!ymd) return null;
  const year = Number(ymd[1]);
  const month = ymd[2] ? Number(ymd[2]) : undefined;
  const day = ymd[3] ? Number(ymd[3]) : undefined;
  if (month !== undefined && (month < 1 || month > 12)) return null;
  if (day !== undefined && (day < 1 || day > 31)) return null;

  if (day !== undefined && month !== undefined) {
    const start = new Date(year, month - 1, day).getTime();
    return { start, end: new Date(year, month - 1, day + 1).getTime() };
  }
  if (month !== undefined) {
    return { start: new Date(year, month - 1, 1).getTime(), end: new Date(year, month, 1).getTime() };
  }
  return { start: new Date(year, 0, 1).getTime(), end: new Date(year + 1, 0, 1).getTime() };
}

const SIZE_UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
};

/** Parses `5mb`, `900kb`, `1024` into a byte count. */
export function parseSize(value: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i.exec(value.trim());
  if (!m) return null;
  const unit = (m[2] ?? 'b').toLowerCase();
  return Math.round(Number(m[1]) * SIZE_UNITS[unit]);
}

/** Parses the tail of `w>2000` style tokens. */
function parseComparison(raw: string, asSize: boolean): Comparison | null {
  const m = /^(>=|<=|>|<|=)?\s*(.+)$/.exec(raw.trim());
  if (!m) return null;
  const op = (m[1] ?? '=') as Comparison['op'];
  const value = asSize ? parseSize(m[2]) : Number(m[2]);
  if (value == null || Number.isNaN(value)) return null;
  return { op, value };
}

function isFlag(value: string): value is IsFlag {
  return (IS_FLAGS as readonly string[]).includes(value);
}

/**
 * Turns a raw search string into a `ParsedQuery`.
 * Unknown or malformed operators degrade into plain free-text terms rather than
 * throwing, so the user always gets results instead of an error.
 */
export function parseQuery(input: string): ParsedQuery {
  if (!input || !input.trim()) return { ...EMPTY };

  const result: ParsedQuery = {
    terms: [],
    excluded: [],
    tags: [],
    excludedTags: [],
    albums: [],
    flags: [],
    excludedFlags: [],
    isEmpty: true,
  };

  for (const rawToken of tokenize(input)) {
    let token = rawToken;
    const negated = token.startsWith('-') && token.length > 1;
    if (negated) token = token.slice(1);

    const quoted = token.startsWith('"') && token.endsWith('"');
    if (quoted) {
      const phrase = token.slice(1, -1).toLowerCase();
      if (phrase) (negated ? result.excluded : result.terms).push(phrase);
      continue;
    }

    // Dimension / size comparisons: w>2000, h<=500, size>5mb
    const cmp = /^(w|width|h|height|size)\s*(>=|<=|>|<|=)(.+)$/i.exec(token);
    if (cmp) {
      const field = cmp[1].toLowerCase();
      const parsed = parseComparison(`${cmp[2]}${cmp[3]}`, field === 'size');
      if (parsed) {
        if (field === 'w' || field === 'width') result.width = parsed;
        else if (field === 'h' || field === 'height') result.height = parsed;
        else result.size = parsed;
        continue;
      }
    }

    const colon = token.indexOf(':');
    if (colon > 0) {
      const key = token.slice(0, colon).toLowerCase();
      const value = token.slice(colon + 1).replace(/^"|"$/g, '');
      if (value) {
        switch (key) {
          case 'tag':
          case 'label':
            (negated ? result.excludedTags : result.tags).push(value.toLowerCase());
            continue;
          case 'album':
          case 'folder':
            result.albums.push(value.toLowerCase());
            continue;
          case 'is':
          case 'type': {
            const flag = value.toLowerCase();
            if (isFlag(flag)) {
              (negated ? result.excludedFlags : result.flags).push(flag);
              continue;
            }
            break;
          }
          case 'after':
          case 'since': {
            const range = parseDateBoundary(value);
            if (range) {
              result.after = range.start;
              continue;
            }
            break;
          }
          case 'before':
          case 'until': {
            const range = parseDateBoundary(value);
            if (range) {
              result.before = range.start;
              continue;
            }
            break;
          }
          case 'year':
          case 'month':
          case 'on': {
            const range = parseDateBoundary(value);
            if (range) {
              result.after = range.start;
              result.before = range.end;
              continue;
            }
            break;
          }
        }
      }
    }

    // Anything left over is plain free text.
    const term = token.toLowerCase();
    if (term) (negated ? result.excluded : result.terms).push(term);
  }

  result.isEmpty =
    result.terms.length === 0 &&
    result.excluded.length === 0 &&
    result.tags.length === 0 &&
    result.excludedTags.length === 0 &&
    result.albums.length === 0 &&
    result.flags.length === 0 &&
    result.excludedFlags.length === 0 &&
    result.after === undefined &&
    result.before === undefined &&
    result.width === undefined &&
    result.height === undefined &&
    result.size === undefined;

  return result;
}

/**
 * The plain-language part of a query, with every operator removed.
 * This is what gets handed to CLIP when searching by meaning.
 */
export function freeText(query: ParsedQuery): string {
  return query.terms.join(' ').trim();
}

/** Short human summary of a parsed query, shown under the search field. */
export function describeQuery(q: ParsedQuery): string {
  if (q.isEmpty) return 'Everything in your index';
  const parts: string[] = [];
  if (q.terms.length) parts.push(`matching ${q.terms.map((t) => `“${t}”`).join(' + ')}`);
  if (q.tags.length) parts.push(`tagged ${q.tags.join(', ')}`);
  if (q.albums.length) parts.push(`in ${q.albums.join(', ')}`);
  if (q.flags.length) parts.push(q.flags.join(' + '));
  if (q.after && q.before) parts.push('in a date range');
  else if (q.after) parts.push('after a date');
  else if (q.before) parts.push('before a date');
  if (q.width || q.height) parts.push('by dimensions');
  if (q.size) parts.push('by file size');
  if (q.excluded.length || q.excludedTags.length || q.excludedFlags.length) parts.push('with exclusions');
  return parts.join(' · ');
}
