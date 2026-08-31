/**
 * The SQL builder is the bridge between the query language and the index, so it
 * is tested at the string level — no database required.
 */

import { buildWhereClause } from '@/db/photos';
import { parseQuery } from '@/lib/query-parser';

function build(query: string) {
  return buildWhereClause(parseQuery(query));
}

describe('buildWhereClause', () => {
  it('always hides archived photos by default', () => {
    const { sql } = build('');
    expect(sql).toContain('archived = 0');
  });

  it('can include archived photos when asked', () => {
    const { sql } = buildWhereClause(parseQuery(''), true);
    expect(sql).toBe('');
  });

  it('binds free text as a LIKE parameter', () => {
    const { sql, params } = build('beach');
    expect(sql).toContain('search_blob LIKE ?');
    expect(params).toContain('%beach%');
  });

  it('negates excluded text', () => {
    const { sql } = build('-whatsapp');
    expect(sql).toContain('search_blob NOT LIKE ?');
  });

  it('matches whole tags, not prefixes', () => {
    const { params } = build('tag:sun');
    // Delimiters on both sides stop `sun` from matching `sunset`.
    expect(params).toContain('%,sun,%');
  });

  it('whitelists the comparison operator', () => {
    const { sql, params } = build('w>2000');
    expect(sql).toContain('width > ?');
    expect(params).toContain(2000);
  });

  it('translates date bounds into an inclusive/exclusive range', () => {
    const { sql } = build('year:2024');
    expect(sql).toContain('created_at >= ?');
    expect(sql).toContain('created_at < ?');
  });

  it('expands smart flags into SQL predicates', () => {
    expect(build('is:video').sql).toContain("media_type = 'video'");
    expect(build('is:favorite').sql).toContain('favorite = 1');
    expect(build('is:untagged').sql).toContain("user_tags = ''");
    expect(build('is:panorama').sql).toContain('width >= height * 2');
  });

  it('wraps a negated flag in NOT', () => {
    expect(build('-is:video').sql).toContain("NOT (media_type = 'video')");
  });

  it('joins every clause with AND', () => {
    const { sql } = build('beach is:favorite w>100');
    expect(sql.startsWith('WHERE ')).toBe(true);
    expect(sql.split(' AND ').length).toBeGreaterThanOrEqual(4);
  });

  it('never interpolates user text directly into SQL', () => {
    const { sql, params } = build(`'; DROP TABLE photos; --`);
    // The whole payload ends up as bound LIKE parameters; the SQL itself only
    // ever contains placeholders.
    expect(sql).not.toMatch(/drop/i);
    expect(sql).not.toContain("'");
    expect(params).toContain('%drop%');
    expect(params).toContain('%photos;%');
  });
});
