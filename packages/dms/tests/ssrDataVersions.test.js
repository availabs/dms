/**
 * The server render's shared page data goes stale (ssr-logged-in-render-and-stale-cache.md, issue 3): each host's
 * routes, and the data model each pattern route keeps for signed-out visitors, lived as long as the process, so
 * an edit never reached them until a restart. An app's data version now moves on every write to its rows and
 * after a maximum age; a loader that sees it move empties the shared model. Rows the routes are built from
 * also rebuild the routes.
 */
import { describe, it, expect } from "vitest";
import { createDataVersions, routeAffecting } from "../src/render/ssr2/dataVersions.js";

describe("SSR data versions", () => {
  it("moves an app's version on each write to it, and only that app's", () => {
    const v = createDataVersions({ maxAgeMs: 0 });
    const a0 = v.versionOf("mny"), b0 = v.versionOf("tny");
    v.noteChange("mny", "docs|page");
    expect(v.versionOf("mny")).not.toBe(a0);
    expect(v.versionOf("tny")).toBe(b0);
    const a1 = v.versionOf("mny");
    v.noteChange("mny", "docs|component");
    expect(v.versionOf("mny")).not.toBe(a1);
  });

  it("moves every version once the maximum age has passed, with no write", () => {
    let t = 1_200_000;   // the start of a 60 s window
    const v = createDataVersions({ maxAgeMs: 60_000, now: () => t });
    const before = v.versionOf("mny");
    t += 30_000;
    expect(v.versionOf("mny")).toBe(before);
    t += 60_000;
    expect(v.versionOf("mny")).not.toBe(before);
  });

  it("never ages with maxAgeMs 0", () => {
    let t = 0;
    const v = createDataVersions({ maxAgeMs: 0, now: () => t });
    const before = v.versionOf("mny");
    t += 10 ** 9;
    expect(v.versionOf("mny")).toBe(before);
  });

  it("asks for the routes to be rebuilt only for the rows they are built from", () => {
    const v = createDataVersions();
    expect(v.noteChange("mny", "prod:site")).toBe(true);
    expect(v.noteChange("mny", "prod|docs:pattern")).toBe(true);
    expect(v.noteChange("mny", "pattern")).toBe(true);           // the admin's bare type
    expect(v.noteChange("mny", "catalyst:theme")).toBe(true);
    expect(v.noteChange("mny", "prod|env:dmsenv")).toBe(true);
    expect(v.noteChange("mny", "docs|page")).toBe(false);
    expect(v.noteChange("mny", "docs|component")).toBe(false);
    expect(v.noteChange("mny", "traffic|10:data")).toBe(false);
    expect(v.noteChange("mny", undefined)).toBe(false);          // a delete notice may carry no type
    expect(routeAffecting("my_env|counts:source")).toBe(false);
  });
});
