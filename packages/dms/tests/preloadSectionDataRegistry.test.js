// The page preload reads which sections to fetch, and how, off each section's COMPONENT (the registry
// entry its element-type resolves to), not off a list of type names in api/.
// planning/tasks/current/preload-section-data-from-registry.md
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = [];
vi.mock('../src/patterns/page/components/sections/components/dataWrapper/getData', () => ({
    getData: vi.fn(async (args) => {
        calls.push(args);
        const n = args.fullDataLoad ? 40 : 25;
        return { length: 40, data: Array.from({ length: n }, (_, i) => ({ n: i })) };
    }),
}));

const { preloadPageSections } = await import('../src/api/preloadSectionData.js');

const graphEntry = { name: 'Graph', type: 'avlGraph', preloadData: true, fullDataLoad: true };
const cardEntry = { name: 'Card', preloadData: true, keepOriginalValues: true };
// the registry as ComponentRegistry/index.jsx builds it: "AVL Graph" is a spread of graph_new
const registry = {
    Graph: graphEntry,
    'AVL Graph': { ...graphEntry, name: 'AVL Graph', hideInSelector: true },
    Card: cardEntry,
    Filter: { name: 'Filter', useDataWrapper: true },            // a dataWrapper component that doesn't opt in
    'Theme Thing': { name: 'Theme Thing', preloadData: true },  // a theme registration that does
};

const section = (id, type) => ({
    id, element: { 'element-type': type, 'element-data': JSON.stringify({
        externalSource: { source_id: 1, view_id: 2, isDms: false },
        columns: [{ name: 'n', show: true }], filters: { op: 'AND', groups: [] }, display: { readyToLoad: true },
    }) },
});
const page = (types) => [{ id: 'p', url_slug: 'p', title: 'p', sections: types.map((t, i) => section(`s${i}`, t)) }];
const rowsOf = (data, i) => JSON.parse(data[0].sections[i].element['element-data']).data?.length;

beforeEach(() => { calls.length = 0; });

describe('preloadPageSections reads the component registry', () => {
    it('loads a Graph in full and a Card one page, with the flags the components declare', async () => {
        const out = await preloadPageSections({}, page(['Graph', 'Card']), 'http://x/p', [], 'p', registry);
        expect(rowsOf(out, 0)).toBe(40);
        expect(rowsOf(out, 1)).toBe(25);
        const byFull = Object.fromEntries(calls.map(c => [c.fullDataLoad ? 'graph' : 'card', c]));
        expect(byFull.graph).toMatchObject({ fullDataLoad: true, keepOriginalValues: false });
        expect(byFull.card).toMatchObject({ fullDataLoad: false, keepOriginalValues: true });
    });

    it('preloads "AVL Graph" sections (the legacy alias the old type list missed)', async () => {
        const out = await preloadPageSections({}, page(['AVL Graph']), 'http://x/p', [], 'p', registry);
        expect(calls).toHaveLength(1);
        expect(calls[0].fullDataLoad).toBe(true);
        expect(rowsOf(out, 0)).toBe(40);
    });

    it('skips components that do not set preloadData, and preloads a theme component that does', async () => {
        await preloadPageSections({}, page(['Filter', 'Theme Thing', 'Unknown']), 'http://x/p', [], 'p', registry);
        expect(calls).toHaveLength(1);
    });

    it('preloads nothing without a registry (no type names in the core)', async () => {
        const data = page(['Graph', 'Card']);
        const out = await preloadPageSections({}, data, 'http://x/p', [], 'p');
        expect(calls).toHaveLength(0);
        expect(out).toBe(data);
    });
});

describe('the built-in components opt in', () => {
    it('Card, Spreadsheet and Graph set preloadData, with their load flags', async () => {
        const read = async (f) => (await import('node:fs')).readFileSync(new URL(f, import.meta.url), 'utf8');
        const base = '../src/patterns/page/components/sections/components/ComponentRegistry/';
        for (const f of ['Card.config.jsx', 'spreadsheet/config.jsx', 'graph_new/config.jsx']) {
            expect(await read(base + f), f).toMatch(/\n\s*preloadData: true,/);
        }
    });
});
