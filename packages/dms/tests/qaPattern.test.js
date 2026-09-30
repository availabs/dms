/**
 * The `qa` pattern type (phase 1 skeleton): pages defined in code, rendered through the page
 * pattern's PageView by a route that picks its own page, with no edit route.
 *
 * See planning/tasks/current/qa-pattern-type.md.
 *
 * Run: npx vitest run packages/dms/tests/qaPattern.test.js --root src/dms
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CMSContext } from "../src/patterns/page/context";
import { buildQaPages, findQaPage } from "../src/patterns/qa/pages";
import { dataItemsNav } from "../src/utils/nav";
import patterns from "../src/patterns";
import pageConfig from "../src/patterns/page/siteConfig";

const pattern = { id: 42, pattern_type: "qa", name: "QA", base_url: "/qa" };

// Walks a route tree and returns every route's `action`.
const actions = (routes = []) =>
  routes.flatMap((r) => [r.action, ...actions(r.children)]).filter(Boolean);

const configProps = {
  app: "qa_test", type: "qa", siteType: "qa_test", baseUrl: "/qa",
  pattern, themes: { default: {} }, authPermissions: {}, datasources: [],
};

describe("buildQaPages", () => {
  it("returns fresh page objects on every call", () => {
    const a = buildQaPages(pattern);
    const b = buildQaPages(pattern);
    expect(a).not.toBe(b);
    a.forEach((page, i) => {
      expect(page).not.toBe(b[i]);
      expect(page.sections).not.toBe(b[i].sections);
    });
    expect(a).toEqual(b);
  });

  it("carries no id on any page or section", () => {
    buildQaPages(pattern).forEach((page) => {
      expect(page).not.toHaveProperty("id");
      page.sections.forEach((s) => expect(s).not.toHaveProperty("id"));
    });
  });

  it("uses fixed group names and trackingIds, unique per page", () => {
    const [first, second] = [buildQaPages(pattern), buildQaPages(pattern)];
    const ids = (pages) => pages.flatMap((p) => p.sections.map((s) => s.trackingId));
    expect(ids(first)).toEqual(ids(second));
    expect(new Set(ids(first)).size).toBe(ids(first).length);
    first.forEach((page) => {
      const groupNames = page.section_groups.map((g) => g.name);
      page.sections.forEach((s) => expect(groupNames).toContain(s.group));
    });
  });

  it("stores lexical element-data as a JSON string", () => {
    buildQaPages(pattern).forEach((page) =>
      page.sections.forEach((s) => {
        expect(s.element["element-type"]).toBe("lexical");
        expect(typeof s.element["element-data"]).toBe("string");
        expect(JSON.parse(s.element["element-data"]).text.root.type).toBe("root");
      })
    );
  });

  it("leaves published unset, so the nav doesn't hide pages as drafts", () => {
    buildQaPages(pattern).forEach((page) => expect(page.published).toBeUndefined());
  });
});

describe("findQaPage", () => {
  const pages = buildQaPages(pattern);

  it("resolves the bare URL (empty slug) to the index-0 page", () => {
    expect(findQaPage(pages, "").title).toBe("Tickets");
  });

  it("gives every page a non-empty slug, since the nav links by slug", () => {
    pages.forEach((page) => expect(page.url_slug).toBeTruthy());
  });

  it("resolves a slug, ignoring a trailing slash", () => {
    expect(findQaPage(pages, "tickets").title).toBe("Tickets");
    expect(findQaPage(pages, "ticket").title).toBe("Ticket");
    expect(findQaPage(pages, "ticket/").title).toBe("Ticket");
  });

  it("falls back to the index-0 page for an unknown slug, as a page pattern does", () => {
    expect(findQaPage(pages, "no_such_page").title).toBe("Tickets");
    expect(findQaPage(pages, "edit").title).toBe("Tickets");
  });
});

describe("nav over QA pages", () => {
  it("lists only the pages not hidden from the nav", () => {
    const nav = dataItemsNav(buildQaPages(pattern), "/qa").filter((d) => !d.hideInNav);
    expect(nav.map((d) => d.name.trim())).toEqual(["Tickets"]);
    expect(nav[0].path).toBe("/qa/tickets");
  });
});

describe("qaConfig", () => {
  it("is registered as pattern type 'qa'", () => {
    expect(Array.isArray(patterns.qa)).toBe(true);
    expect(typeof patterns.qa[0]).toBe("function");
  });

  it("declares a view route and no edit route", () => {
    const cfg = patterns.qa[0](configProps);
    expect(actions(cfg.children)).not.toContain("edit");
    expect(actions(cfg.children)).toContain("view");
  });

  it("leaves the page pattern's own routes untouched", () => {
    patterns.qa[0](configProps);
    expect(actions(pageConfig[0](configProps).children)).toContain("edit");
  });

  it("keeps the page format, which SectionGroup needs for the sections ViewComp", () => {
    const cfg = patterns.qa[0](configProps);
    expect(cfg.format).toEqual(pageConfig[0](configProps).format);
  });

  // The user menu's view/edit toggle reads CMSContext.hasEditor; the qa type has no editor.
  const hasEditorIn = (cfg) => {
    const Shell = cfg.children[0].type;
    const Probe = () => String(React.useContext(CMSContext).hasEditor);
    return renderToStaticMarkup(React.createElement(Shell, { user: {} }, React.createElement(Probe)));
  };

  it("tells the page shell it has no editor", () => {
    expect(hasEditorIn(patterns.qa[0](configProps))).toBe("false");
  });

  it("leaves hasEditor true for a page pattern", () => {
    expect(hasEditorIn(pageConfig[0](configProps))).toBe("true");
  });

  it("preload returns the loader's rows untouched", async () => {
    const cfg = patterns.qa[0](configProps);
    const rows = [{ id: 1, url_slug: "x" }];
    expect(await cfg.preload(null, rows, { url: "http://x/qa" }, { "*": "" })).toBe(rows);
  });
});
