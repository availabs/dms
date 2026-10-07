/**
 * Collapsible section groups (sectionGroup.jsx + sectionArray.jsx's View).
 *
 * Contract pinned here:
 *   - a `collapsible` group opens at its `startCollapsed`; while collapsed only its
 *     `showWhenCollapsed` sections show, and a corner toggle reports aria-expanded;
 *   - the other sections stay rendered under `hidden`, so their data loads with the page;
 *   - a collapsed group with no such section shows a header row with its display name instead;
 *   - a group that isn't collapsible, or any group in edit mode, renders every section and no toggle.
 *
 * Rendered with react-dom/server (no DOM); the section component itself is stubbed, since only
 * which sections render is under test.
 *
 * Run: npx vitest run packages/dms/tests/sectionGroupCollapsible.test.jsx
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

vi.mock("../src/patterns/page/components/sections/section", () => ({
    SectionView: ({ value }) => <i data-section={value.trackingId} />,
    SectionEdit: ({ value }) => <i data-section={value.trackingId} />,
}));

import SectionGroup from "../src/patterns/page/components/sections/sectionGroup";
import { ThemeContext } from "../src/ui/useTheme";
import { PageContext, CMSContext } from "../src/patterns/page/context";

const UI = {
    LayoutGroup: ({ children }) => <div>{children}</div>,
    Icon: ({ icon, className }) => <b data-icon={icon} className={className} />,
    Modal: () => null,
};
const theme = { layoutGroup: { styles: [{ name: "default" }] } };

const sections = [
    { trackingId: "summary", group: "site", showWhenCollapsed: true },
    { trackingId: "detail", group: "site" },
    { trackingId: "elsewhere", group: "other" },
];
// In edit mode the page's own list component renders; stub it to list what it was given.
const EditList = ({ value, group }) => <>{value.filter(s => s.group === group.name).map(s => <i key={s.trackingId} data-section={s.trackingId} />)}</>;

const html = (group, { edit = false, pageSections = sections } = {}) => {
    const item = edit
        ? { draft_sections: pageSections, draft_section_groups: [group] }
        : { sections: pageSections, section_groups: [group] };
    return renderToStaticMarkup(
        <MemoryRouter>
            <ThemeContext.Provider value={{ theme, UI }}>
                <CMSContext.Provider value={{}}>
                    <PageContext.Provider value={{ item }}>
                        <SectionGroup group={group} edit={edit}
                                      attributes={{ sections: edit ? { EditComp: EditList } : {} }} />
                    </PageContext.Provider>
                </CMSContext.Provider>
            </ThemeContext.Provider>
        </MemoryRouter>
    );
};
// Every section the band rendered, and those not under a `hidden` wrapper (the section's
// wrapper div, then its chrome div, then the stubbed section).
const rendered = (markup) => [...markup.matchAll(/data-section="([^"]*)"/g)].map(([, id]) => id);
const shown = (markup) => [...markup.matchAll(/<div(?![^>]*\shidden="")[^>]*><div[^>]*><i data-section="([^"]*)"/g)].map(([, id]) => id);
const site = { name: "site", displayName: "Site A", position: "content", index: 0 };

describe("collapsible section groups", () => {
    it("opens collapsed when startCollapsed: only the showWhenCollapsed sections, with a corner toggle", () => {
        const markup = html({ ...site, collapsible: true, startCollapsed: true });
        expect(shown(markup)).toEqual(["summary"]);
        // still rendered, only hidden: its data loads with the page
        expect(rendered(markup)).toEqual(["summary", "detail"]);
        expect(markup).toContain('aria-expanded="false"');
        expect(markup).toContain('aria-label="Expand Site A"');
        // the corner toggle, not the header row
        expect(markup).not.toContain(">Site A<");
    });

    it("opens expanded without startCollapsed: every section, the toggle ready to collapse", () => {
        const markup = html({ ...site, collapsible: true });
        expect(shown(markup)).toEqual(["summary", "detail"]);
        expect(markup).toContain('aria-expanded="true"');
        expect(markup).toContain('aria-label="Collapse Site A"');
    });

    it("shows a header row with the display name when no section stays visible", () => {
        const plain = sections.map(({ showWhenCollapsed, ...s }) => s);
        const markup = html({ ...site, collapsible: true, startCollapsed: true }, { pageSections: plain });
        expect(shown(markup)).toEqual([]);
        expect(rendered(markup)).toEqual(["summary", "detail"]);
        expect(markup).toContain(">Site A<");
        expect(markup).toContain('aria-expanded="false"');
    });

    it("ignores startCollapsed and showWhenCollapsed on a group that isn't collapsible", () => {
        const markup = html({ ...site, startCollapsed: true });
        expect(shown(markup)).toEqual(["summary", "detail"]);
        expect(markup).not.toContain("aria-expanded");
    });

    it("shows every section and no toggle in edit mode", () => {
        const markup = html({ ...site, collapsible: true, startCollapsed: true }, { edit: true });
        expect(rendered(markup)).toEqual(["summary", "detail"]);
        expect(markup).not.toContain("aria-expanded");
    });
});
