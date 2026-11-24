/**
 * Static HTML with islands, phase 1 (delivery without RSC):
 * planning/tasks/current/static-html-islands.md. render/islands/islandData.js and servePage.js.
 *
 * What matters here:
 *   - a route that did not opt in is never rendered by this path (no capture render);
 *   - a page this path can't serve is remembered, per user, so it isn't rendered twice on every request;
 *   - the data a page carries never holds the visitor's token, and survives being put inside a <script>.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// The real chrome pulls in the whole page pattern; the server logic under test only needs something that
// renders the three slots.
vi.mock("../src/render/islands/ClientChrome.jsx", () => ({
  default: ({ top, content, bottom }) => React.createElement("div", { id: "chrome" }, top, content, bottom),
  preloadChromeTheme: async () => {},
}));

import { createIslandsRenderer } from "../src/render/islands/servePage.js";
import { buildIsland, serializeIslandData, headKey } from "../src/render/islands/islandData.js";
import { configureIslandsClient } from "../src/render/islands/clientConfig.js";
import { pluginsOfSections, contributionOwners, pluginRecords } from "../src/plugins/registries.js";

const optedIn = [{ path: "/*", handle: { islandsView: true } }];
const notOptedIn = [{ path: "/*", handle: { islandsView: false } }];

const eligibleCapture = (over = {}) => ({
  status: 200,
  slots: { top: "", content: "<p>static content</p>", bottom: "" },
  themeFontsHtml: "",
  capture: {
    eligible: true,
    island: { selection: "default", documentTitle: "A page" },
    sections: [{ key: "a", index: 0, eligible: true }],
    ...over,
  },
});

function setup({ routes = optedIn, result = eligibleCapture() } = {}) {
  const capture = vi.fn(async () => (typeof result === "function" ? result() : result));
  const renderer = createIslandsRenderer({
    ensureRoutes: async () => ({ routes }),
    capture,
    setStubLocation: () => {},
  });
  return { capture, renderer };
}

const req = (path = "/a") => new Request(`http://site.test${path}`);

beforeEach(() => {
  configureIslandsClient({ loadThemes: async (names) => Object.fromEntries(names.filter((n) => n === "code").map((n) => [n, {}])) });
});

describe("island data", () => {
  it("never carries the visitor's token or password", () => {
    const island = buildIsland(eligibleCapture().capture, { user: { id: 7, email: "a@b.c", token: "SECRET", password: "PW" } });
    expect(island.session).toEqual({ state: "user", user: { id: 7, email: "a@b.c" } });
    expect(JSON.stringify(island)).not.toMatch(/SECRET|PW/);
  });

  it("marks a signed-out render as anonymous", () => {
    expect(buildIsland(eligibleCapture().capture, null).session).toEqual({ state: "anonymous" });
  });

  it("keeps section data only for the sections that stay live", () => {
    const capture = eligibleCapture({
      sections: [{ key: "s0", index: 0, eligible: true }, { key: "s1", index: 1, eligible: false }],
      islandPage: { item: { sections: [
        { element: { "element-type": "lexical", "element-data": "{\"big\":1}" } },
        { element: { "element-type": "Spreadsheet", "element-data": "{\"live\":1}" } },
      ] } },
    }).capture;
    const { sectionIslands } = buildIsland(capture, null);
    expect(sectionIslands.sections).toEqual([{ key: "s1", index: 1 }]);
    expect(sectionIslands.page.item.sections[0].element["element-data"]).toBe("{}");
    expect(sectionIslands.page.item.sections[1].element["element-data"]).toBe("{\"live\":1}");
    // the capture's own page is not changed
    expect(capture.islandPage.item.sections[0].element["element-data"]).toBe("{\"big\":1}");
  });

  it("marks the sections that keep their HTML until used, and only those", () => {
    const capture = eligibleCapture({
      sections: [{ key: "s0", index: 0, eligible: false, wake: true }, { key: "s1", index: 1, eligible: false, wake: false }],
      islandPage: { item: { sections: [{ element: {} }, { element: {} }] } },
    }).capture;
    expect(buildIsland(capture, null).sectionIslands.sections).toEqual([{ key: "s0", index: 0, wake: true }, { key: "s1", index: 1 }]);
  });

  it("has no sectionIslands when every section is static", () => {
    expect(buildIsland(eligibleCapture().capture, null).sectionIslands).toBeUndefined();
  });

  it("serializes to JSON that cannot close its <script> and reads back unchanged", () => {
    const data = { island: { title: "</script><script>alert(1)</script> & more" } };
    const text = serializeIslandData(data);
    expect(text).not.toMatch(/[<>&]/);
    expect(JSON.parse(text)).toEqual(data);
  });

  it("gives the same head key for the same head and a different one otherwise", () => {
    expect(headKey("<link a>")).toBe(headKey("<link a>"));
    expect(headKey("<link a>")).not.toBe(headKey("<link b>"));
  });
});

describe("the plugins a page's sections need", () => {
  beforeEach(() => {
    contributionOwners.sectionTypes = new Map([["Map", "mapeditor"]]);
    contributionOwners.columnTypes = new Map([["sparkline", "charts"]]);
    contributionOwners.formatFunctions = new Map([["furlongs", "units"]]);
    pluginRecords.clear();
    for (const name of ["mapeditor", "charts", "units"]) pluginRecords.set(name, { name, version: "1.2.0" });
  });

  it("names the owner of a section type, a column type and a format function, once each", () => {
    const sections = [
      { element: { "element-type": "Map", "element-data": "{}" } },
      { element: { "element-type": "Map", "element-data": "{}" } },
      { element: { "element-type": "Spreadsheet", "element-data": JSON.stringify({ columns: [{ name: "a", type: "sparkline" }] }) } },
      { element: { "element-type": "Card", "element-data": { columns: [{ name: "b", formatFn: "furlongs" }] } } },
    ];
    expect(pluginsOfSections(sections)).toEqual([
      { name: "mapeditor", version: "1.2.0" }, { name: "charts", version: "1.2.0" }, { name: "units", version: "1.2.0" },
    ]);
  });

  it("names none for sections of core types", () => {
    expect(pluginsOfSections([{ element: { "element-type": "Spreadsheet", "element-data": "{\"columns\":[{\"type\":\"text\"}]}" } }, undefined])).toEqual([]);
  });

  it("is sent with the page, with how many sections mount at once", async () => {
    const { renderer } = setup({ result: eligibleCapture({
      sections: [{ key: "s0", index: 0, eligible: false, wake: true }, { key: "s1", index: 1, eligible: false }],
      islandPage: { item: { sections: [{ element: { "element-type": "Spreadsheet" } }, { element: { "element-type": "Map" } }] } },
    }) });
    const page = await renderer.render(req(), {}, { nav: true });
    expect(page.island.sectionIslands.plugins).toEqual([{ name: "mapeditor", version: "1.2.0" }]);
    expect([page.islands, page.mountNow, page.plugins]).toEqual([2, 1, ["mapeditor"]]);
  });
});

describe("islands renderer", () => {
  it("passes a route that did not opt in without a capture render", async () => {
    const { capture, renderer } = setup({ routes: notOptedIn });
    expect(await renderer.render(req(), {})).toEqual({ served: false, reason: "route not opted in" });
    expect(capture).not.toHaveBeenCalled();
  });

  it("serves an eligible page as a document: the chrome around the static HTML", async () => {
    const { renderer } = setup();
    const page = await renderer.render(req(), {});
    expect(page.served).toBe(true);
    expect(page.islands).toBe(0);
    expect(page.html).toContain('data-dms-slot="content"');
    expect(page.html).toContain("<p>static content</p>");
    expect(page.island.headKey).toBe(headKey(""));
  });

  it("answers a browser navigation with data and renders no chrome", async () => {
    const { renderer } = setup();
    const page = await renderer.render(req(), {}, { nav: true });
    expect(page.served).toBe(true);
    expect(page.slots.content).toBe("<p>static content</p>");
    expect(page.html).toBeUndefined();
  });

  it("remembers a page it can't serve, so the next request skips the capture render", async () => {
    const { capture, renderer } = setup({ result: { capture: { eligible: false, reason: "section PDFGenerator" } } });
    expect((await renderer.render(req(), {})).reason).toBe("section PDFGenerator");
    expect((await renderer.render(req(), {})).reason).toBe("section PDFGenerator");
    expect(capture).toHaveBeenCalledTimes(1);
    // another URL is decided on its own
    await renderer.render(req("/b"), {});
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("remembers per user: one visitor's answer is not another's", async () => {
    const { capture, renderer } = setup({ result: { capture: { eligible: false, reason: "no permission" } } });
    await renderer.render(req(), {});
    await renderer.render(req(), { user: { id: 1 } });
    await renderer.render(req(), { user: { id: 2 } });
    await renderer.render(req(), { user: { id: 1 } });
    expect(capture).toHaveBeenCalledTimes(3);
  });

  it("forgets what it remembered when cleared (the handler's invalidateRoutes)", async () => {
    const { capture, renderer } = setup({ result: { capture: { eligible: false, reason: "x" } } });
    await renderer.render(req(), {});
    renderer.clear();
    await renderer.render(req(), {});
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("passes a redirect and does not remember it", async () => {
    const { capture, renderer } = setup({ result: { redirect: "/auth/login" } });
    expect((await renderer.render(req(), {})).reason).toBe("redirect /auth/login");
    await renderer.render(req(), {});
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("passes a page whose theme the browser can't rebuild from code", async () => {
    const { renderer } = setup({ result: eligibleCapture({ island: { selection: "saved_in_db" } }) });
    expect(await renderer.render(req(), {})).toEqual({ served: false, reason: "theme saved_in_db is not a code theme" });
    const ok = setup({ result: eligibleCapture({ island: { selection: "code" } }) });
    expect((await ok.renderer.render(req(), {}, { nav: true })).served).toBe(true);
  });
});
