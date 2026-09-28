/**
 * dms-format ref expansion is batched (api/proecessNewData.js,
 * planning/tasks/current/boot-chain-fewer-serial-hops.md).
 *
 * `loadDmsFormats` used to await one falcor round trip per dms-format
 * attribute, in series — the site boot paid dms_envs → patterns → theme_refs
 * as three serial requests, a page draft_sections → sections as two. All keys'
 * ref ids are on the row already, so they now go in ONE get. These tests pin
 * that, and that the output is what the per-key version produced.
 */
import { describe, it, expect } from "vitest";
import { processNewData } from "../src/api/proecessNewData.js";

const APP = "app";

// A falcor stand-in: records every get() and answers byId paths from `rows`
// (served at both the app-namespaced and the legacy byId address).
function mockFalcor(rows) {
  const calls = [];
  return {
    calls,
    async get(...paths) {
      calls.push(paths);
      const byId = {};
      for (const p of paths) {
        const i = p.indexOf("byId");
        const id = p[i + 1];
        const attrs = [].concat(p[i + 2]);
        const row = rows[id];
        if (!row) continue;
        byId[id] = {};
        for (const a of attrs) {
          if (a === "data") byId[id].data = structuredClone(row.data);
          else if (a.startsWith("data ->> ")) byId[id][a] = row.data?.[a.split("->>")[1].trim().replace(/'/g, "")];
          else byId[id][a] = row[a];
        }
      }
      return { json: { dms: { data: { [APP]: { byId }, byId } } } };
    },
  };
}

const siteFormat = {
  app: APP,
  type: "site",
  attributes: [
    { key: "title", type: "text" },
    { key: "dms_envs", type: "dms-format", format: `${APP}+dmsenv` },
    { key: "patterns", type: "dms-format", format: `${APP}+pattern` },
    { key: "theme_refs", type: "dms-format", format: `${APP}+theme`, refAttributes: ["data ->> 'name'"] },
  ],
  registerFormats: [
    { type: "pattern", attributes: [{ key: "pages", type: "dms-format", format: `${APP}+page` }] },
  ],
};
const dmsAttrs = (format) => Object.fromEntries(format.attributes.filter(a => a.type === "dms-format").map(a => [a.key, a]));

const cacheWith = (id, data) => ({
  dms: { data: { [APP]: { byId: { [id]: { id, app: APP, type: "site", data: { value: data } } } } } },
});

describe("processNewData — batched dms-format expansion", () => {
  it("fetches every dms-format key of a row in ONE get, and assigns the same shape as before", async () => {
    const falcor = mockFalcor({
      5: { data: { name: "env" } },
      10: { data: { name: "p10", pages: [{ id: 30 }] } },
      11: { data: { id: "no-access" } },
      20: { data: { name: "t20", huge: "not fetched" } },
      30: { data: { title: "page30" } },
    });
    const [site] = await processNewData(
      cacheWith(1, { title: "s", dms_envs: [{ id: 5 }], patterns: [{ id: 10 }, { id: 11 }], theme_refs: [{ id: 20 }] }),
      [1], false, 0, APP, "site", dmsAttrs(siteFormat), siteFormat, falcor,
    );

    // one get for the row's three keys + one for the pattern's own sub-format
    expect(falcor.calls).toHaveLength(2);
    const firstIds = falcor.calls[0].map(p => p[p.indexOf("byId") + 1]).sort();
    expect(firstIds).toEqual([10, 11, 20, 5].sort());

    expect(site.dms_envs[0]).toMatchObject({ id: 5, name: "env" });
    expect(site.theme_refs[0]).toMatchObject({ id: 20, name: "t20" });
    expect(site.theme_refs[0].huge).toBeUndefined();          // refAttributes projection kept
    expect(site.patterns[0].pages[0]).toMatchObject({ id: 30, title: "page30" }); // recursion landed before the spread
    expect(site.patterns[1]).toMatchObject({ id: 11, no_access: true });           // marker survives
  });

  it("gives a row referenced under two keys its own object under each", async () => {
    const format = {
      app: APP, type: "site",
      attributes: [
        { key: "sections", type: "dms-format", format: `${APP}+component` },
        { key: "draft_sections", type: "dms-format", format: `${APP}+component` },
      ],
      registerFormats: [],
    };
    const falcor = mockFalcor({ 40: { data: { element: { "element-type": "lexical" } } } });
    const [page] = await processNewData(
      cacheWith(2, { sections: [{ id: 40 }], draft_sections: [{ id: 40 }] }),
      [2], false, 0, APP, "site", dmsAttrs(format), format, falcor,
    );
    expect(falcor.calls).toHaveLength(1);
    expect(page.sections[0]).toEqual(page.draft_sections[0]);
    expect(page.sections[0]).not.toBe(page.draft_sections[0]);
    expect(page.sections[0].element).not.toBe(page.draft_sections[0].element);
  });

  it("makes no request for a row with no refs", async () => {
    const falcor = mockFalcor({});
    const [site] = await processNewData(
      cacheWith(3, { title: "empty", patterns: [] }),
      [3], false, 0, APP, "site", dmsAttrs(siteFormat), siteFormat, falcor,
    );
    expect(falcor.calls).toHaveLength(0);
    expect(site.title).toBe("empty");
  });
});
