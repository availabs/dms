/**
 * A reload of the page on screen (sync's start-up loads end in router.revalidate()) used to hand every
 * section its settings without the preloaded rows; the sections were rebuilt and fetched everything again
 * (FUSION national-overview, 2026-11-25: 128 data requests for 59 distinct). The reload now keeps the page
 * that is on screen unless the page or one of its sections was saved since. And a link page's own URL is
 * answered with a redirect from the loader. See planning/tasks/current/page-reload-keeps-sections.md.
 */
import { describe, it, expect } from "vitest";
import { keepShownPage } from "../src/api/preloadSectionData.js";
import { linkPageTarget } from "../src/patterns/page/pages/_utils/linkPage.js";

const section = (id, updated_at, data) => ({ id, updated_at, element: { 'element-type': 'Card', 'element-data': JSON.stringify({ data }) } });
const page = (sections, updated_at = 't1') => ({ id: '10', url_slug: 'overview', updated_at, sections });
const other = { id: '11', url_slug: 'about', updated_at: 't1', sections: [section('3', 't1')] };

describe("keepShownPage", () => {
    const shown = [page([section('1', 't1', [{ a: 1 }]), section('2', 't1', [{ b: 2 }])]), other];

    it("keeps the page on screen when the page and its sections were not saved since", () => {
        const fresh = [page([section('1', 't1'), section('2', 't1')]), { ...other }];
        const kept = keepShownPage(fresh, shown, 'overview');
        expect(kept[0]).toBe(shown[0]);
        expect(kept[1]).toBe(fresh[1]);
        expect(fresh[0].sections[0].element['element-data']).toBe(JSON.stringify({}));
    });
    it("reads the same save from the server's route and from sync's local copy as one time", () => {
        const pg = [page([section('1', '2026-11-25 19:11:37.77242+00', [{ a: 1 }])], '2026-11-25 19:11:39.994597+00')];
        const iso = [page([section('1', '2026-11-25T19:11:37.772Z')], '2026-11-25T19:11:39.994Z')];
        expect(keepShownPage(iso, pg, 'overview')[0]).toBe(pg[0]);
        expect(keepShownPage([page([section('1', '2026-11-25T19:11:37.773Z')], '2026-11-25T19:11:39.994Z')], pg, 'overview')).toBe(null);
    });
    it("is null when a section was saved, added or removed, or the page row was saved", () => {
        expect(keepShownPage([page([section('1', 't2'), section('2', 't1')])], shown, 'overview')).toBe(null);
        expect(keepShownPage([page([section('1', 't1')])], shown, 'overview')).toBe(null);
        expect(keepShownPage([page([section('1', 't1'), section('2', 't1'), section('9', 't1')])], shown, 'overview')).toBe(null);
        expect(keepShownPage([page([section('1', 't1'), section('2', 't1')], 't2')], shown, 'overview')).toBe(null);
    });
    it("is null when there is nothing on screen to compare, or the rows carry no save time", () => {
        const fresh = [page([section('1', 't1'), section('2', 't1')])];
        expect(keepShownPage(fresh, null, 'overview')).toBe(null);
        expect(keepShownPage(fresh, [other], 'overview')).toBe(null);
        expect(keepShownPage([page([section('1', 't1')], null)], [page([section('1', 't1')], null)], 'overview')).toBe(null);
    });
});

describe("linkPageTarget", () => {
    const url = "http://fusion.localhost/fusion/reports";
    const rows = (link) => [{ id: '1', url_slug: 'reports', nav_link: link, sections: [] }, { id: '2', url_slug: 'home', index: 0, sections: [{}] }];

    it("is the link of a link page, for a path from the root or a full URL", () => {
        expect(linkPageTarget(rows('/fusion/national-overview'), 'reports', url)).toBe('/fusion/national-overview');
        expect(linkPageTarget(rows('/fusion/explore#method'), 'reports', url)).toBe('/fusion/explore#method');
        expect(linkPageTarget(rows('https://example.org/x'), 'reports', url)).toBe('https://example.org/x');
    });
    it("is null for a page with no link, and for the pattern's root page when it has none", () => {
        expect(linkPageTarget(rows('/fusion/national-overview'), 'home', url)).toBe(null);
        expect(linkPageTarget(rows('/fusion/national-overview'), '', "http://fusion.localhost/fusion")).toBe(null);
        expect(linkPageTarget(rows(''), 'reports', url)).toBe(null);
    });
    it("leaves to the view: a restricted page, a blocked row, sub:// on the server, a relative link, its own URL", () => {
        expect(linkPageTarget([{ ...rows('/x')[0], authPermissions: '{"groups":{}}' }], 'reports', url)).toBe(null);
        expect(linkPageTarget([{ id: 'no-access', url_slug: 'reports', nav_link: 'no-access' }], 'reports', url)).toBe(null);
        expect(linkPageTarget(rows('sub://npmrds/x'), 'reports', url)).toBe(null);
        expect(linkPageTarget(rows('national-overview'), 'reports', url)).toBe(null);
        expect(linkPageTarget(rows('/fusion/reports'), 'reports', url)).toBe(null);
        expect(linkPageTarget(rows('/fusion/reports?x=1'), 'reports', url)).toBe(null);
    });
});
