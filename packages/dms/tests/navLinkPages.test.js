/**
 * Link pages and nav destination resolution.
 *
 * A "link page" is a page row carrying `nav_link` (page.format.js): it renders no
 * content and exists only to put a nav entry pointing somewhere else into the page
 * tree. See planning/tasks/current/nav-link-pages.md.
 *
 * The MitigateNY shape these were written against: a county-plan pattern mounted at
 * the site root whose "Track Progress" section needs a child entry pointing at the
 * `actions` pattern, which mounts at /actions on every county subdomain.
 */
import { describe, it, expect } from "vitest";
import { dataItemsNav, getChildNav } from "../src/utils/nav";

// A page row as the list route loads it (siteConfig.jsx filter.attributes).
const page = (over) => ({ published: "published", ...over });

describe("dataItemsNav — link pages at the top level", () => {
    it("uses nav_link as the destination and does NOT prefix baseUrl", () => {
        const [item] = dataItemsNav(
            [page({ id: "1", title: "Actions", url_slug: "actions_link", nav_link: "/actions/dashboard" })],
            "/county",
        );
        expect(item.path).toBe("/actions/dashboard");
    });

    it("keeps it a plain path (not a full URL) so SPA nav and useMatch still work", () => {
        const [item] = dataItemsNav(
            [page({ id: "1", title: "Actions", nav_link: "/actions/dashboard" })],
            "",
        );
        expect(item.path.startsWith("/")).toBe(true);
        expect(item.path).not.toContain("://");
    });

    it("does not pick up the /edit prefix in edit mode", () => {
        const [item] = dataItemsNav(
            [page({ id: "1", title: "Actions", nav_link: "/actions/dashboard" })],
            "/county",
            true,
        );
        expect(item.path).toBe("/actions/dashboard");
    });

    it("passes an external URL through untouched", () => {
        const [item] = dataItemsNav(
            [page({ id: "1", title: "FEMA", nav_link: "https://www.fema.gov/x" })],
            "/county",
        );
        expect(item.path).toBe("https://www.fema.gov/x");
    });

    it("leaves sub:// unresolved on the server (hydration upgrades it)", () => {
        // No `window` under vitest's default node environment — same path SSR takes.
        const [item] = dataItemsNav(
            [page({ id: "1", title: "Plan", nav_link: "sub://county_template/the_plan" })],
            "/actions",
        );
        expect(item.path).toBe("sub://county_template/the_plan");
    });

    it("wins over url_slug when both are set", () => {
        const [item] = dataItemsNav(
            [page({ id: "1", title: "Actions", url_slug: "track_progress/actions_dashboard", nav_link: "/actions/dashboard" })],
            "",
        );
        expect(item.path).toBe("/actions/dashboard");
    });

    it("still honours hide_in_nav, draft and icon like any other page", () => {
        const items = dataItemsNav(
            [
                page({ id: "1", title: "Draft link", nav_link: "/actions/dashboard", published: "draft" }),
                page({ id: "2", title: "Hidden link", nav_link: "/actions/view", hide_in_nav: "hide", icon: "Link" }),
            ],
            "",
        );
        expect(items).toHaveLength(1);              // the draft is dropped in view mode
        expect(items[0].hideInNav).toBe("hide");    // Layout.jsx does the root-level filtering
        expect(items[0].icon).toBe("Link");
    });
});

describe("getChildNav — the same branch must exist for children", () => {
    // The motivating case: the link entry is a CHILD of a section parent, and
    // getChildNav is a separate code path from dataItemsNav.
    const tree = [
        page({ id: "parent", title: "Track Progress", url_slug: "track_progress" }),
        page({ id: "kid", title: "Actions Dashboard", parent: "parent", nav_link: "/actions/dashboard", index: 0 }),
    ];

    it("resolves a child link page without the baseUrl prefix", () => {
        const [child] = getChildNav({ id: "parent" }, tree, "/county");
        expect(child.path).toBe("/actions/dashboard");
    });

    it("reaches the child through the top-level walk too", () => {
        const [root] = dataItemsNav(tree, "");
        expect(root.path).toBe("/track_progress");
        expect(root.subMenus[0].path).toBe("/actions/dashboard");
    });

    it("regression: an absolute child destination is no longer prefixed with baseUrl", () => {
        // Before the shared `navPath` helper, getChildNav had no ABSOLUTE_URL branch,
        // so this produced "/county/https://www.fema.gov/x".
        const [child] = getChildNav(
            { id: "parent" },
            [page({ id: "kid", title: "FEMA", parent: "parent", url_slug: "https://www.fema.gov/x" })],
            "/county",
        );
        expect(child.path).toBe("https://www.fema.gov/x");
    });
});

describe("BC — rows without nav_link are unchanged", () => {
    it("an ordinary page still takes the baseUrl and /edit prefixes", () => {
        const rows = [page({ id: "1", title: "The Plan", url_slug: "the_plan" })];
        expect(dataItemsNav(rows, "/county")[0].path).toBe("/county/the_plan");
        expect(dataItemsNav(rows, "/county", true)[0].path).toBe("/county/edit/the_plan");
    });

    it("an authored rootPath navItem still resolves to a root-absolute path", () => {
        const [item] = dataItemsNav(
            [{ id: "cnav_1", title: "The Risk", url_slug: "the_risk", rootPath: true }],
            "/actions",
        );
        // No `window` here, so toRootUrl emits the bare root path (SSR behaviour).
        expect(item.path).toBe("/the_risk");
    });

    it("an authored label row still renders with no path", () => {
        const [item] = dataItemsNav([{ id: "l1", title: "Section", noLink: true }], "/actions");
        expect(item.path).toBeUndefined();
        expect(item.name).toBe("Section");
    });

    it("a page with no slug still falls back to its id", () => {
        const [item] = dataItemsNav([page({ id: "99", title: "Untitled" })], "/county");
        expect(item.path).toBe("/county/99");
    });
});
