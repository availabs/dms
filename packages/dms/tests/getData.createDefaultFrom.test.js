/**
 * Unit tests for applyCreateDefaults `defaultFrom` — derive a create-time field
 * from another field of the in-progress new row (e.g. the Page-QA add-ticket
 * modal stamping surface/page_route from the usePageParams-prefilled page_key,
 * so a fresh ticket renders on sitemgmt/tickets without waiting for cr_sync).
 *
 * Run: npx vitest run tests/getData.createDefaultFrom.test.js
 */

import { describe, it, expect } from "vitest";

import { applyCreateDefaults } from "../src/patterns/page/components/sections/components/dataWrapper/getData.js";

const apiLoad = async () => [];

describe("applyCreateDefaults defaultFrom", () => {

  it("derives a field by splitting another field", async () => {
    const columns = [
      { name: "surface", defaultFrom: { column: "page_key", split: ":", index: 0 } },
      { name: "page_route", defaultFrom: { column: "page_key", split: ":", index: 1, prefix: "/" } },
    ];
    const out = await applyCreateDefaults({ columns, newItem: { page_key: "tsmo2:congestion_v2" }, apiLoad });
    expect(out.surface).toBe("tsmo2");
    expect(out.page_route).toBe("/congestion_v2");
  });

  it("copies the source verbatim when no split is given", async () => {
    const columns = [{ name: "page_disp", defaultFrom: { column: "page_key" } }];
    const out = await applyCreateDefaults({ columns, newItem: { page_key: "tsmo2:about" }, apiLoad });
    expect(out.page_disp).toBe("tsmo2:about");
  });

  it("leaves the field empty when the source field is empty or missing", async () => {
    const columns = [{ name: "surface", defaultFrom: { column: "page_key", split: ":", index: 0 } }];
    expect((await applyCreateDefaults({ columns, newItem: {}, apiLoad })).surface).toBeUndefined();
    expect((await applyCreateDefaults({ columns, newItem: { page_key: "" }, apiLoad })).surface).toBeUndefined();
  });

  it("does not overwrite an already-set value", async () => {
    const columns = [{ name: "surface", defaultFrom: { column: "page_key", split: ":", index: 0 } }];
    const out = await applyCreateDefaults({ columns, newItem: { page_key: "tsmo2:x", surface: "manual" }, apiLoad });
    expect(out.surface).toBe("manual");
  });

  it("leaves the field empty when the split index is out of range", async () => {
    const columns = [{ name: "slug", defaultFrom: { column: "page_key", split: ":", index: 1 } }];
    const out = await applyCreateDefaults({ columns, newItem: { page_key: "nocolon" }, apiLoad });
    expect(out.slug).toBeUndefined();
  });

  it("still applies defaultValue and defaultFn columns unchanged (BC)", async () => {
    const columns = [
      { name: "status", defaultValue: "Triage" },
      { name: "reporter", defaultFn: "user" },
    ];
    const out = await applyCreateDefaults({ columns, newItem: {}, apiLoad, user: { email: "a@b.c" } });
    expect(out.status).toBe("Triage");
    expect(out.reporter).toBe("a@b.c");
  });
});
