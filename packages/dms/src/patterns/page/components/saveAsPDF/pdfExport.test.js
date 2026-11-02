import { describe, it, expect } from 'vitest';
import { buildPageTree, coverPages, printableIds, selectedInOrder, filterTree, fileNameFor } from './pdfExport';

const PAGES = [
    { id: 1, title: 'Introduction', url_slug: 'intro', index: '0' },
    { id: 2, title: 'Purpose', url_slug: 'purpose', parent: 1, index: '1' },
    { id: 3, title: 'Process', url_slug: 'process', parent: 1, index: '0' },
    { id: 4, title: 'Hazards', url_slug: 'hazards', index: '1' },
    { id: 5, title: 'Drought', url_slug: 'drought', parent: 4, published: 'draft', index: '0' },
    { id: 6, title: 'Overview', url_slug: 'overview', parent: 4, index: '1', hide_in_nav: true },
    { id: 7, title: 'Overview', url_slug: 'overview-2', parent: 4, index: '2' },
    { id: 8, title: 'Cover', url_slug: 'cover', is_cover_page: 'yes' },
    { id: 9, title: 'Elsewhere', nav_link: '/other' },
];

describe('buildPageTree', () => {
    const tree = buildPageTree(PAGES, '/plan');

    it('nests pages in index order under the mount path, without cover or link pages', () => {
        expect(tree.map(n => n.title)).toEqual(['Introduction', 'Hazards']);
        expect(tree[0].children.map(n => n.title)).toEqual(['Process', 'Purpose']);
        expect(tree[0].path).toBe('/plan/intro');
        expect(tree[0].children[0].path).toBe('/plan/process');
    });

    it('keeps drafts (marked) and pages hidden from the nav', () => {
        const kids = tree[1].children;
        expect(kids.map(n => [n.title, n.draft, n.hidden])).toEqual([
            ['Drought', true, false], ['Overview', false, true], ['Overview', false, false],
        ]);
    });

    it('uses a bare slug path on a root mount', () => {
        expect(buildPageTree(PAGES, '')[0].path).toBe('/intro');
    });

    it('selects printable pages in print order, keeping same-titled siblings apart', () => {
        const all = new Set(tree.flatMap(printableIds));
        expect([...all]).not.toContain(5);
        expect(selectedInOrder(tree, all).map(p => [p.id, p.depth])).toEqual([[1, 0], [3, 1], [2, 1], [4, 0], [6, 1], [7, 1]]);
    });

    it('filters to matches and their ancestors', () => {
        expect(filterTree(tree, 'purp').map(n => [n.title, n.children.map(c => c.title)])).toEqual([['Introduction', ['Purpose']]]);
    });
});

describe('helpers', () => {
    it('lists cover pages', () => expect(coverPages(PAGES).map(p => p.id)).toEqual([8]));
    it('makes file names', () => expect(fileNameFor('Millbrook County HMP')).toBe('millbrook-county-hmp'));
});
