// Regression: a filter on a calculated `<sql> as <alias>` column made every SIBLING filter's
// option list fail ("syntax error at or near as") once a value was picked, because
// ExternalFilters/ComplexFilters handed ConditionValueInput only the source schema, where the
// calc column doesn't exist — the picked leaf went to the server unmapped.
// planning: src/dms/planning/tasks/current/uda-filter-expr-alias-where.md
import { describe, expect, test } from 'vitest';
import { filterConditionColumns } from './utils';
import { resolveFilterGroupsForQuery, buildUdaConfig } from '../../buildUdaConfig';

const CALC = "to_jsonb( array_remove( array[ case when data->>'dam' is not null then 'structural' end ], null) )::text as action_category_json";
const sectionColumns = [
  { name: 'action_name', type: 'text', show: true },
  { name: CALC, display_name: 'Action Category', type: 'multiselect', display: 'calculated' },
];
const sourceColumns = [{ name: 'action_name', type: 'TEXT' }, { name: 'source_id', type: 'TEXT' }];
const tree = { op: 'AND', groups: [
  { op: 'filter', col: 'source_id', value: ['State'] },
  { op: 'filter', col: CALC, value: ['structural'], isExternal: true, isMulti: true },
] };
const byName = (cols) => (name) => cols.find((c) => c.name === name);
const calcLeaf = (fg) => fg.groups.find((g) => g.col.startsWith('to_jsonb'));

describe('filterConditionColumns', () => {
  test('section columns first, then source-only columns, no duplicates', () => {
    const cols = filterConditionColumns(sectionColumns, sourceColumns);
    expect(cols.map((c) => c.name)).toEqual(['action_name', CALC, 'source_id']);
    expect(cols[0].type).toBe('text'); // the section's copy wins
  });

  test('undefined inputs', () => {
    expect(filterConditionColumns(undefined, undefined)).toEqual([]);
  });

  test('source-only lookup leaves a calc leaf unmapped (the bug)', () => {
    const leaf = calcLeaf(resolveFilterGroupsForQuery(tree, byName(sourceColumns), false));
    expect(leaf.op).toBe('filter');
    expect(leaf.col).toBe(CALC); // alias still on it → server syntax error
  });

  test('with section columns the calc leaf maps like the main query does', () => {
    const leaf = calcLeaf(resolveFilterGroupsForQuery(tree, byName(filterConditionColumns(sectionColumns, sourceColumns)), false));
    expect(leaf.op).toBe('array_contains');
    expect(leaf.col).not.toMatch(/\sas\s+action_category_json\s*$/i);
    expect(leaf.value).toEqual(['structural']);
  });
});

// Second half of the same bug: a LEGACY column-level filter on a multiselect column went out as
// flat `filter: { <expr>: [v] }` → `<expr> = ANY(...)`, which never matches a JSON-array value.

describe('buildUdaConfig — legacy multiselect column filters', () => {
  const externalSource = { source_id: 1, view_id: 2, isDms: false, env: 'test', srcEnv: 'test', columns: sourceColumns };
  const cols = (filters, extra = {}) => [
    { name: 'action_name', type: 'text', show: true },
    { name: 'source_id', type: 'text', show: false, filters: [{ operation: 'filter', values: ['State'] }] },
    { name: CALC, display_name: 'Action Category', type: 'multiselect', display: 'calculated', show: false, filters, ...extra },
  ];
  const leaves = (fg) => { const out = []; const w = (g) => { if (!g) return; if (g.col) out.push(g); (g.groups || []).forEach(w); }; w(fg); return out; };

  test('multiselect filter values become an array_contains leaf, not a flat equality', () => {
    const { options } = buildUdaConfig({ externalSource, columns: cols([{ operation: 'filter', values: ['structural'] }]), filters: {} });
    const flatKeys = Object.keys(options.filter || {});
    expect(flatKeys.some((k) => k.startsWith('to_jsonb'))).toBe(false);
    expect(flatKeys).toContain('source_id'); // a plain column keeps the flat path
    const leaf = leaves(options.filterGroups).find((l) => l.col.startsWith('to_jsonb'));
    expect(leaf.op).toBe('array_contains');
    expect(leaf.value).toEqual(['structural']);
    expect(leaf.col).not.toMatch(/\sas\s+action_category_json\s*$/i);
  });

  test('exclude → array_not_contains; null sentinels stay on the flat path', () => {
    const ex = buildUdaConfig({ externalSource, columns: cols([{ operation: 'exclude', values: ['structural'] }]), filters: {} }).options;
    expect(leaves(ex.filterGroups).find((l) => l.col.startsWith('to_jsonb')).op).toBe('array_not_contains');
    const nul = buildUdaConfig({ externalSource, columns: cols([{ operation: 'filter', values: ['null'] }]), filters: {} }).options;
    expect(Object.keys(nul.filter).some((k) => k.startsWith('to_jsonb'))).toBe(true);
  });

  test('comparison-series arms carry the leaf too', () => {
    const { options } = buildUdaConfig({
      externalSource, columns: cols([{ operation: 'filter', values: ['structural'] }]), filters: {},
      comparisonSeries: { enabled: true, seriesKey: '__s', variants: [{ label: 'A', filters: {} }, { label: 'B', filters: {} }] },
    });
    expect(options.seriesVariants?.length).toBe(2);
    for (const v of options.seriesVariants) expect(leaves(v.filterGroups).some((l) => l.op === 'array_contains')).toBe(true);
  });
});
