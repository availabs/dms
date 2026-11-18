import { describe, it, expect } from 'vitest';
import { trimDataWrapperForView } from './trimForView';
import { buildUdaConfig } from './buildUdaConfig';
import { trimSectionsForView } from '../../../../../../api/preloadSectionData';

// A source with many columns; the section uses a few of them, one through a calculated column
const sourceColumns = [
    'geoid', 'county', 'owner_type', 'building_full_market_val', 'nri_ltng_risk_score',
    ...Array.from({ length: 40 }, (_, i) => `unused_${i}`),
].map(name => ({ name, type: 'TEXT', display_name: name }));

const section = {
    externalSource: { source_id: 1649, view_id: 2354, env: 'hazmit_dama', isDms: false, columns: sourceColumns },
    columns: [
        { name: 'county', show: true, group: true },
        { name: 'building_full_market_val', show: true, fn: 'sum' },
        { name: "CASE WHEN owner_type IN ('2') THEN 1 ELSE 0 END AS is_state", type: 'calculated', origin: 'calculated-column', show: false },
    ],
    filters: { op: 'AND', groups: [{ op: 'gte', col: 'nri_ltng_risk_score', value: [80] }] },
    display: { readyToLoad: true },
    data: [{ county: 'Albany', building_full_market_val: 1 }],
};

const requestParts = (state) => {
    // outputSourceInfo describes the output for the editor's chaining picker and carries the
    // column list itself; it is not part of the request
    const out = { ...buildUdaConfig(state) };
    delete out.outputSourceInfo;
    return out;
};

describe('trimDataWrapperForView', () => {
    it('keeps only the source columns the section refers to', () => {
        const trimmed = trimDataWrapperForView(section);
        expect(trimmed.externalSource.columns.map(c => c.name).sort())
            .toEqual(['building_full_market_val', 'county', 'nri_ltng_risk_score', 'owner_type']);
        // everything else is untouched
        expect(trimmed.columns).toBe(section.columns);
        expect(trimmed.data).toBe(section.data);
    });

    it('builds the same request from the trimmed settings', () => {
        expect(requestParts(trimDataWrapperForView(section))).toEqual(requestParts(section));
    });

    it('takes and returns a string, as element-data is saved', () => {
        const out = trimDataWrapperForView(JSON.stringify(section));
        expect(typeof out).toBe('string');
        expect(JSON.parse(out).externalSource.columns).toHaveLength(4);
    });

    it('keeps the v1 shape (sourceInfo) working', () => {
        const { externalSource, ...rest } = section;
        const out = trimDataWrapperForView({ ...rest, sourceInfo: externalSource });
        expect(out.sourceInfo.columns).toHaveLength(4);
    });

    it('leaves a section with no chosen columns alone (it may show every source column)', () => {
        const noColumns = { ...section, columns: [] };
        expect(trimDataWrapperForView(noColumns)).toBe(noColumns);
    });

    it('keeps a column whose name is not a plain identifier', () => {
        const odd = { ...section, externalSource: { ...section.externalSource, columns: [...sourceColumns, { name: 'Total Value ($)' }] } };
        expect(trimDataWrapperForView(odd).externalSource.columns.map(c => c.name)).toContain('Total Value ($)');
    });

    it('returns unreadable settings unchanged', () => {
        expect(trimDataWrapperForView('{not json')).toBe('{not json');
        expect(trimDataWrapperForView(null)).toBe(null);
    });
});

describe('trimSectionsForView', () => {
    const page = (sections) => ({ id: '1', url_slug: 'a', sections });
    const components = { Spreadsheet: { trimForView: trimDataWrapperForView } };
    const sec = (type) => ({ id: type, element: { 'element-type': type, 'element-data': JSON.stringify(section) } });

    it("trims the page's sections whose type declares trimForView, without mutating the input", () => {
        const data = [page([sec('Spreadsheet'), sec('Lexical')]), { id: '2', url_slug: 'b' }];
        const before = JSON.stringify(data);
        const out = trimSectionsForView(data, 'a', components);
        expect(JSON.stringify(data)).toBe(before);
        expect(JSON.parse(out[0].sections[0].element['element-data']).externalSource.columns).toHaveLength(4);
        expect(out[0].sections[1]).toBe(data[0].sections[1]);
        expect(out[1]).toBe(data[1]);
    });

    it('returns the data itself when nothing changes', () => {
        const data = [page([sec('Lexical')])];
        expect(trimSectionsForView(data, 'a', components)).toBe(data);
        expect(trimSectionsForView(data, 'missing', components)).toBe(data);
    });

    it('leaves a section alone when its trim throws', () => {
        const data = [page([sec('Spreadsheet')])];
        const out = trimSectionsForView(data, 'a', { Spreadsheet: { trimForView: () => { throw new Error('x'); } } });
        expect(out).toBe(data);
    });
});
