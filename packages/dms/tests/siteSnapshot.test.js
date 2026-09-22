/**
 * Site snapshot persistence guard
 * (dms planning/tasks/current/no-access-stub-default-theme.md, fix 3).
 *
 * dmsSiteFactory caches the loaded site data to localStorage so the next boot
 * can build routes instantly. When the server auth-blocks the boot request,
 * patterns come back as minimal `id: 'no-access'` stubs (no theme/config) —
 * persisting those poisons the next boot into a default-themed render even
 * when that boot's own fetch is healthy. A snapshot containing stubbed
 * patterns must NOT overwrite a good prior snapshot.
 */
import { describe, it, expect } from "vitest";

import {
  hasNoAccessPatterns,
  persistSiteSnapshot,
} from "../src/render/spa/utils/snapshot.js";

const fullPattern = (over = {}) => ({
  id: 21,
  base_url: "/",
  pattern_type: "page",
  theme: { selectedTheme: "brand" },
  ...over,
});
const stubPattern = () => ({
  id: "no-access",
  base_url: "/",
  pattern_type: "page",
});
// The shape a stub ACTUALLY has by the time a snapshot is considered: ref
// expansion (api/proecessNewData.js) merges the row's `data` over the ref and
// then writes `id: ref.id` LAST, overwriting the stub's own `id: 'no-access'`.
// Checking `id` therefore never matched in the field, and stub snapshots were
// persisted for months despite the guard. `no_access` is the marker that
// survives expansion.
const expandedStubPattern = () => ({
  id: 21,
  ref: "app+pattern",
  base_url: "/",
  pattern_type: "page",
  no_access: true,
});
const site = (patterns) => [{ id: 10, site_name: "test", patterns }];

const makeStorage = (initial = {}) => {
  const store = { ...initial };
  return {
    store,
    setItem: (k, v) => { store[k] = v; },
    getItem: (k) => (k in store ? store[k] : null),
  };
};

describe("hasNoAccessPatterns", () => {
  it("false for fully-resolved site data", () => {
    expect(hasNoAccessPatterns(site([fullPattern(), fullPattern({ id: 12 })]))).toBe(false);
  });

  it("true when any pattern is the no-access stub", () => {
    expect(hasNoAccessPatterns(site([fullPattern(), stubPattern()]))).toBe(true);
  });

  it("true for a ref-EXPANDED stub, whose id is the real row id", () => {
    expect(hasNoAccessPatterns(site([expandedStubPattern()]))).toBe(true);
    expect(hasNoAccessPatterns(site([fullPattern(), expandedStubPattern()]))).toBe(true);
  });

  it("tolerates empty/missing patterns and multiple site rows", () => {
    expect(hasNoAccessPatterns(site([]))).toBe(false);
    expect(hasNoAccessPatterns([{ id: 10 }])).toBe(false);
    expect(hasNoAccessPatterns([])).toBe(false);
    expect(hasNoAccessPatterns(undefined)).toBe(false);
    expect(hasNoAccessPatterns([{ patterns: [fullPattern()] }, { patterns: [stubPattern()] }])).toBe(true);
  });
});

describe("persistSiteSnapshot", () => {
  it("writes healthy site data", () => {
    const storage = makeStorage();
    const data = site([fullPattern()]);
    expect(persistSiteSnapshot(storage, "app-type", data)).toBe(true);
    expect(JSON.parse(storage.store["app-type"])).toEqual(data);
  });

  it("skips the write when patterns are stubbed, preserving the prior snapshot", () => {
    const good = site([fullPattern()]);
    const storage = makeStorage({ "app-type": JSON.stringify(good) });
    expect(persistSiteSnapshot(storage, "app-type", site([stubPattern()]))).toBe(false);
    expect(JSON.parse(storage.store["app-type"])).toEqual(good);
  });

  it("skips the write for a ref-expanded stub too, preserving the prior snapshot", () => {
    const good = site([fullPattern()]);
    const storage = makeStorage({ "app-type": JSON.stringify(good) });
    expect(persistSiteSnapshot(storage, "app-type", site([expandedStubPattern()]))).toBe(false);
    expect(JSON.parse(storage.store["app-type"])).toEqual(good);
  });

  it("no-ops without a storage (SSR)", () => {
    expect(persistSiteSnapshot(null, "app-type", site([fullPattern()]))).toBe(false);
  });
});
