/**
 * /sync/delta cost controls and change_log snapshot policy.
 *
 * Covers the server half of sync-delta-change-log-bloat.md:
 *   item B — count first, and refuse to serialize a delta the client would
 *            only measure and discard (436 MB / ~1 GB heap per request when
 *            measured live 2026-09-10, which OOM'd the server 26 times in
 *            25 minutes);
 *   item 1 — push the split-type exclusion into SQL so those rows are never
 *            read, de-TOASTed and parsed just to be filtered out in JS;
 *   item 4 — stop storing a `data` snapshot for split-row types at all
 *            (24 GB of TOAST, 65% of one app's change_log);
 *   plus the `"no-access"` poison mutation, which reached a bigint cast and
 *   came back as a 500 the client then retried forever.
 */
import { describe, it, expect } from 'vitest';
import {
  buildDeltaQuery,
  resolveMaxChanges,
  isValidItemId,
  SQL_NOT_SPLIT_TYPE,
} from '../src/routes/sync/sync.js';
import { changeLogData } from '../src/db/table-resolver.js';

const TABLE = 'dms.change_log';
const APP = 'mitigat-ny-prod';

/** The shared WHERE clause, as it appears in each of the two statements. */
const whereOf = (sql) => sql.slice(sql.indexOf(' WHERE ') + 7).replace(/ ORDER BY .*$/, '');

describe('resolveMaxChanges', () => {
  it('caps a client asking for more than the server allows', () => {
    expect(resolveMaxChanges('5000', 1000)).toBe(1000);
  });

  it('honours a client asking for less', () => {
    expect(resolveMaxChanges('100', 1000)).toBe(100);
  });

  it('falls back to the server default when the param is absent or junk', () => {
    expect(resolveMaxChanges(undefined, 1000)).toBe(1000);
    expect(resolveMaxChanges('', 1000)).toBe(1000);
    expect(resolveMaxChanges('abc', 1000)).toBe(1000);
    expect(resolveMaxChanges('NaN', 1000)).toBe(1000);
    expect(resolveMaxChanges('0', 1000)).toBe(1000);
    expect(resolveMaxChanges('-5', 1000)).toBe(1000);
  });

  // The whole point of min(): the server never ships a count the client has
  // not already agreed to accept, so a served delta can't be discarded.
  it('never exceeds the client threshold', () => {
    for (const client of [1, 10, 999, 1000, 1001, 100000]) {
      expect(resolveMaxChanges(String(client), 1000)).toBeLessThanOrEqual(client);
    }
  });
});

describe('buildDeltaQuery', () => {
  const scopes = [
    ['full-app', { table: TABLE, app: APP, sinceRev: 907608 }],
    ['pattern', { table: TABLE, app: APP, pattern: 'mitigateny_sullivan|page', sinceRev: 907608 }],
    ['pattern without a pipe', { table: TABLE, app: APP, pattern: 'legacy_pattern', sinceRev: 5 }],
    ['explicit type', { table: TABLE, app: APP, type: 'foo|component', sinceRev: 5 }],
  ];

  // The invariant the tooLarge short-circuit rests on.
  it.each(scopes)('counts over exactly the predicate it reads rows with (%s)', (_name, opts) => {
    const { rowSql, countSql } = buildDeltaQuery(opts);
    expect(whereOf(countSql)).toBe(whereOf(rowSql));
    expect(countSql).toContain('count(*) AS n');
    expect(rowSql).toContain('ORDER BY revision ASC');
    expect(countSql).not.toContain('ORDER BY');
  });

  it.each(scopes)('binds one param per placeholder (%s)', (_name, opts) => {
    const { rowSql, params } = buildDeltaQuery(opts);
    const highest = Math.max(...[...rowSql.matchAll(/\$(\d+)/g)].map(m => Number(m[1])));
    expect(highest).toBe(params.length);
  });

  it('excludes split-row types from the full-app scope in SQL', () => {
    const { rowSql, countSql, excludeSplit } = buildDeltaQuery({ table: TABLE, app: APP, sinceRev: 0 });
    expect(rowSql).toContain(SQL_NOT_SPLIT_TYPE);
    expect(countSql).toContain(SQL_NOT_SPLIT_TYPE);
    expect(excludeSplit).toBe(true); // JS backstop still required
  });

  it('excludes split-row types from the pattern scope in SQL', () => {
    const { rowSql, countSql, excludeSplit } = buildDeltaQuery({
      table: TABLE, app: APP, pattern: 'mitigateny_sullivan|page', sinceRev: 0,
    });
    expect(rowSql).toContain(SQL_NOT_SPLIT_TYPE);
    expect(countSql).toContain(SQL_NOT_SPLIT_TYPE);
    expect(excludeSplit).toBe(true);
  });

  it('honours an explicit ?type= request even for a split type', () => {
    // Asking for a split type by name is answered, not silently emptied.
    const { rowSql, excludeSplit } = buildDeltaQuery({
      table: TABLE, app: APP, type: 'jurisdictions|1346450:data', sinceRev: 0,
    });
    expect(rowSql).not.toContain(SQL_NOT_SPLIT_TYPE);
    expect(excludeSplit).toBe(false);
  });

  it('matches sibling types under the pattern instance prefix', () => {
    const { rowSql, params } = buildDeltaQuery({
      table: TABLE, app: APP, pattern: 'songs_2|page', sinceRev: 42,
    });
    expect(params).toEqual([APP, 'songs_2|page', 'songs_2', 42]);
    expect(rowSql).toContain("type LIKE $3 || '|%'");
  });
});

describe('changeLogData', () => {
  it('stores nothing for a delete, as before', () => {
    expect(changeLogData('foo|component', 'D', '{"a":1}')).toBe(null);
  });

  it('stores the snapshot for an ordinary type', () => {
    expect(changeLogData('foo|component', 'U', '{"a":1}')).toBe('{"a":1}');
    expect(changeLogData('mitigateny_sullivan|page', 'I', '{"a":1}')).toBe('{"a":1}');
  });

  it('drops the snapshot for a split-row type', () => {
    // The 7.7 MB-per-write blob that grew to 24 GB.
    expect(changeLogData('jurisdictions|1346450:data', 'U', '{"big":1}')).toBe(null);
    expect(changeLogData('jurisdictions|1346450:data', 'I', '{"big":1}')).toBe(null);
  });

  it('drops the snapshot for the legacy split-type form too', () => {
    // No ':data' suffix, so only the broad isSplitType catches it.
    expect(changeLogData('traffic_counts-1', 'U', '{"big":1}')).toBe(null);
  });
});

describe('isValidItemId', () => {
  it('rejects the "no-access" placeholder that reached a bigint cast', () => {
    expect(isValidItemId('no-access')).toBe(false);
  });

  it('accepts positive integers as number or string', () => {
    expect(isValidItemId(1346450)).toBe(true);
    expect(isValidItemId('1346450')).toBe(true);
    expect(isValidItemId(' 1346450 ')).toBe(true);
  });

  it('rejects everything that cannot be a bigint key', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, '', '0', '-3', '1.5', '12abc', null, undefined, {}, []]) {
      expect(isValidItemId(bad)).toBe(false);
    }
  });
});
